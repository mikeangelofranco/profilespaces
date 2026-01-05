import json
import os
import re
import secrets
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q
from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import PasswordResetToken, Profile, SessionToken

User = get_user_model()
HANDLE_PATTERN = re.compile(r"^[a-zA-Z0-9._-]{3,30}$")
MAX_INTERESTS = 5
MAX_BIO_LENGTH = 160
MAX_STATUS_LENGTH = 80
MAX_LOCATION_LENGTH = 120
RESERVED_HANDLES = {"admin", "support", "profilespaces", "profile", "settings"}
PHOTO_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def parse_json_body(request: HttpRequest):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Invalid JSON body."}, status=400)
    if not isinstance(payload, dict):
        return None, JsonResponse({"detail": "Expected a JSON object."}, status=400)
    return payload, None


def normalize_handle(value: str) -> str:
    return (value or "").strip()


def validate_handle(value: str, label: str = "Username") -> str:
    handle = normalize_handle(value)
    if not handle:
        return f"{label} is required."
    if not HANDLE_PATTERN.match(handle):
        return "Use 3-30 letters, numbers, or ._- in your username."
    if handle.lower() in RESERVED_HANDLES:
        return f"{label} is not available."
    return ""


def clean_interests(raw) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        return []
    cleaned: list[str] = []
    for item in raw:
        text = str(item or "").strip()
        if not text:
            continue
        text = text[:60]
        if text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= MAX_INTERESTS:
            break
    return cleaned


def profile_photo_url(profile, request: HttpRequest | None = None) -> str:
    if not profile or not profile.photo:
        return ""
    url = profile.photo.url
    if request:
        return request.build_absolute_uri(url)
    return url


def serialize_profile(profile: Profile, request: HttpRequest | None = None) -> dict:
    return {
        "display_name": profile.display_name,
        "username": profile.user.username,
        "profile_url": profile.profile_slug or "",
        "status": profile.status,
        "bio": profile.bio,
        "location": profile.location,
        "interests": profile.interests if isinstance(profile.interests, list) else [],
        "photo_url": profile_photo_url(profile, request),
        "visibility": profile.visibility,
        "theme": profile.theme,
        "show_location": profile.show_location,
        "allow_search": profile.allow_search,
        "updated_at": profile.updated_at.isoformat(),
    }


def serialize_notifications(profile: Profile) -> dict:
    return {
        "email_notifications": bool(profile.email_notifications),
        "product_updates": bool(profile.product_updates),
        "new_follower_alerts": bool(profile.new_follower_alerts),
        "weekly_digest": bool(profile.weekly_digest),
        "pause_notifications": profile.pause_notifications,
        "pause_until": profile.pause_until.isoformat() if profile.pause_until else None,
    }

def ensure_profile(user: User) -> Profile:
    profile, _ = Profile.objects.get_or_create(
        user=user,
        defaults={
          "display_name": user.first_name or user.username,
          "profile_slug": user.username,
          "visibility": "public",
          "theme": "system",
          "show_location": False,
          "allow_search": False,
        },
    )
    return profile


def to_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def require_api_token(request: HttpRequest):
    expected = getattr(settings, "API_AUTH_TOKEN", None)
    if not expected:
        return None
    provided = request.headers.get("X-API-Key") or request.headers.get("X-Api-Key")
    if not provided or not secrets.compare_digest(provided, expected):
        return JsonResponse({"detail": "Invalid or missing API token."}, status=401)
    return None


def serialize_user(user: User, request: HttpRequest | None = None) -> dict:
    profile = ensure_profile(user)
    interests = profile.interests if isinstance(profile.interests, list) else []
    return {
        "id": user.id,
        "name": profile.display_name if profile else user.first_name or user.username,
        "username": user.username,
        "email": user.email,
        "status": profile.status if profile else "",
        "bio": profile.bio if profile else "",
        "location": profile.location if profile else "",
        "interests": interests,
        "profile_url": profile.profile_slug or "",
        "photo_url": profile_photo_url(profile, request),
        "visibility": profile.visibility,
        "theme": profile.theme,
        "show_location": profile.show_location,
        "allow_search": profile.allow_search,
        "agreed_to_terms": bool(profile and profile.agreed_to_terms_at),
    }


def create_session_token(user: User, remember: bool = False) -> SessionToken:
    """Create a login token with a short or long expiry."""
    lifetime = timedelta(days=30) if remember else timedelta(days=1)
    expires_at = timezone.now() + lifetime
    key = secrets.token_urlsafe(32)
    while SessionToken.objects.filter(key=key).exists():
        key = secrets.token_urlsafe(32)
    return SessionToken.objects.create(user=user, key=key, expires_at=expires_at)


def get_session_token(request: HttpRequest) -> str:
    """Extract a session token from common auth headers or cookies."""
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("token "):
        return auth_header.split(" ", 1)[1].strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    alt_header = request.headers.get("X-Session-Token") or request.headers.get("X-Session")
    if alt_header:
        return alt_header.strip()
    cookie_value = request.COOKIES.get("session_token")
    return cookie_value.strip() if cookie_value else ""


def authenticate_session(request: HttpRequest, refresh: bool = True):
    """Validate a session token and optionally refresh its expiry."""
    token_key = get_session_token(request)
    if not token_key:
        return None, JsonResponse({"detail": "Session token required."}, status=401)
    try:
        session_token = SessionToken.objects.select_related("user", "user__profile").get(key=token_key)
    except SessionToken.DoesNotExist:
        return None, JsonResponse({"detail": "Invalid session token."}, status=401)
    if session_token.is_expired():
        session_token.delete()
        return None, JsonResponse({"detail": "Session expired. Please log in again."}, status=401)
    if refresh:
        session_token.refresh_expiry()
    return session_token, None


def remember_from_token(session_token: SessionToken) -> bool:
    """Infer remember-me preference from an existing token."""
    if not session_token.expires_at:
        return False
    return (session_token.expires_at - timezone.now()) > timedelta(days=2)


@csrf_exempt
@require_http_methods(["POST"])
def signup(request: HttpRequest):
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    name = (payload.get("name") or "").strip()
    username = (payload.get("username") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    confirm = payload.get("confirm") or payload.get("confirm_password") or ""
    status_text = (payload.get("status") or "").strip()
    bio = (payload.get("bio") or "").strip()
    location = (payload.get("location") or "").strip()
    interests = payload.get("interests") if isinstance(payload.get("interests"), list) else []
    agree = to_bool(payload.get("agree") or payload.get("agreed_to_terms"))
    remember = to_bool(payload.get("remember"))

    errors = {}
    if not name:
        errors["name"] = "Name is required."
    elif len(name) < 2:
        errors["name"] = "Name must be at least 2 characters."

    username_error = validate_handle(username, "Username")
    if username_error:
        errors["username"] = username_error
    elif User.objects.filter(username__iexact=username).exists():
        errors["username"] = "Username is already taken."
    if not email:
        errors["email"] = "Email is required."
    elif User.objects.filter(email__iexact=email).exists():
        errors["email"] = "Email is already in use."
    if not password:
        errors["password"] = "Password is required."
    elif len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."
    if password != confirm:
        errors["confirm"] = "Passwords do not match."
    if not agree:
        errors["agree"] = "You must accept the terms to create an account."
    if len(status_text) > MAX_STATUS_LENGTH:
        errors["status"] = f"Status must be {MAX_STATUS_LENGTH} characters or less."
    if len(bio) > MAX_BIO_LENGTH:
        errors["bio"] = f"Bio must be {MAX_BIO_LENGTH} characters or less."
    if len(location) > MAX_LOCATION_LENGTH:
        errors["location"] = "Location is too long."
    cleaned_interests = clean_interests(interests)
    if len(cleaned_interests) > MAX_INTERESTS:
        errors["interests"] = f"Add up to {MAX_INTERESTS} interests."

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    with transaction.atomic():
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=name,
        )
        Profile.objects.create(
            user=user,
            display_name=name or username,
            profile_slug=username,
            status=status_text,
            bio=bio,
            location=location,
            interests=cleaned_interests,
            agreed_to_terms_at=timezone.now() if agree else None,
        )

    token = create_session_token(user, remember=remember)
    return JsonResponse(
        {
            "token": token.key,
            "expires_at": token.expires_at.isoformat(),
            "user": serialize_user(user, request),
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["POST"])
def login(request: HttpRequest):
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    identifier = (payload.get("identifier") or "").strip()
    password = payload.get("password") or ""
    remember = to_bool(payload.get("remember"))

    errors = {}
    if not identifier:
        errors["identifier"] = "Username or email is required."
    if not password:
        errors["password"] = "Password is required."
    if errors:
        return JsonResponse({"errors": errors}, status=400)

    user = User.objects.filter(
        Q(username__iexact=identifier) | Q(email__iexact=identifier)
    ).first()

    if not user or not user.check_password(password):
        return JsonResponse({"detail": "Invalid credentials."}, status=401)

    token = create_session_token(user, remember=remember)
    return JsonResponse(
        {
            "token": token.key,
            "expires_at": token.expires_at.isoformat(),
            "user": serialize_user(user, request),
        }
    )


@csrf_exempt
@require_http_methods(["GET"])
def session(request: HttpRequest):
    """Return the current user for a valid session token."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    return JsonResponse({"user": serialize_user(session_token.user, request)})


@csrf_exempt
@require_http_methods(["POST"])
def logout(request: HttpRequest):
    """Invalidate the current session token."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request, refresh=False)
    if auth_error:
        return auth_error

    session_token.delete()
    response = JsonResponse({"detail": "Logged out."})
    response.delete_cookie("session_token")
    return response


@csrf_exempt
@require_http_methods(["POST"])
def logout_all(request: HttpRequest):
    """Invalidate all active sessions for the current user."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request, refresh=False)
    if auth_error:
        return auth_error

    SessionToken.objects.filter(user=session_token.user).delete()
    response = JsonResponse({"detail": "All sessions cleared."})
    response.delete_cookie("session_token")
    return response


@csrf_exempt
@require_http_methods(["POST"])
def change_email(request: HttpRequest):
    """Update the authenticated user's email after password confirmation."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    user = session_token.user

    new_email = (payload.get("email") or payload.get("new_email") or "").strip().lower()
    password = payload.get("password") or payload.get("current_password") or ""

    errors = {}
    if not new_email:
        errors["email"] = "Email is required."
    else:
        try:
            validate_email(new_email)
        except ValidationError:
            errors["email"] = "Enter a valid email address."
    if new_email and User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
        errors["email"] = "Email is already in use."
    if not password:
        errors["password"] = "Password confirmation is required."
    elif not user.check_password(password):
        errors["password"] = "Incorrect password."

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    user.email = new_email
    user.save(update_fields=["email"])
    return JsonResponse({"user": serialize_user(user, request)})


@csrf_exempt
@require_http_methods(["POST"])
def change_password(request: HttpRequest):
    """Change the authenticated user's password."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    session_token, auth_error = authenticate_session(request, refresh=False)
    if auth_error:
        return auth_error
    user = session_token.user

    current_password = payload.get("current") or payload.get("current_password") or ""
    new_password = payload.get("new") or payload.get("new_password") or payload.get("password") or ""
    confirm = payload.get("confirm") or payload.get("confirm_password") or ""

    errors = {}
    if not current_password:
        errors["current"] = "Enter your current password."
    elif not user.check_password(current_password):
        errors["current"] = "Incorrect current password."
    if not new_password:
        errors["new"] = "Create a new password."
    elif len(new_password) < 8:
        errors["new"] = "Password must be at least 8 characters."
    if not confirm:
        errors["confirm"] = "Confirm your new password."
    elif new_password != confirm:
        errors["confirm"] = "Passwords do not match."

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    remember_choice = remember_from_token(session_token)
    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=["password"])
        SessionToken.objects.filter(user=user).delete()
        PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        token = create_session_token(user, remember=remember_choice)

    return JsonResponse(
        {
            "token": token.key,
            "expires_at": token.expires_at.isoformat(),
            "user": serialize_user(user, request),
        }
    )


@csrf_exempt
@require_http_methods(["GET", "PATCH", "POST"])
def profile_settings(request: HttpRequest):
    """Fetch or update the authenticated user's profile."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    user = session_token.user
    profile = ensure_profile(user)

    if request.method == "GET":
        return JsonResponse({"profile": serialize_profile(profile, request)})

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    display_name = (payload.get("display_name") or payload.get("name") or "").strip()
    username = normalize_handle(payload.get("username") or user.username)
    profile_slug = normalize_handle(
        payload.get("profile_url") or payload.get("profile_slug") or payload.get("slug") or username
    )
    status_text = (payload.get("status") or "").strip()
    bio = (payload.get("bio") or "").strip()
    location = (payload.get("location") or "").strip()
    interests_raw = payload.get("interests") if "interests" in payload else None
    visibility = (payload.get("visibility") or "").strip().lower() or profile.visibility
    theme = (payload.get("theme") or profile.theme or "system").strip().lower()
    show_location = to_bool(
        payload.get("show_location")
        if "show_location" in payload
        else payload.get("showLocation")
        if "showLocation" in payload
        else profile.show_location
    )
    allow_search = to_bool(
        payload.get("allow_search")
        if "allow_search" in payload
        else payload.get("allowSearch")
        if "allowSearch" in payload
        else profile.allow_search
    )

    errors = {}
    if not display_name:
        errors["display_name"] = "Display name is required."
    elif len(display_name) < 2:
        errors["display_name"] = "Display name must be at least 2 characters."
    elif len(display_name) > 150:
        errors["display_name"] = "Display name is too long."

    username_error = validate_handle(username, "Username")
    if username_error:
        errors["username"] = username_error
    elif User.objects.filter(username__iexact=username).exclude(pk=user.pk).exists():
        errors["username"] = "This username is already taken."

    profile_error = validate_handle(profile_slug, "Profile URL")
    if profile_error:
        errors["profile_url"] = (
            "Profile URL must match username rules." if "Use 3-30" in profile_error else profile_error
        )
    elif Profile.objects.filter(profile_slug__iexact=profile_slug).exclude(user=user).exists():
        errors["profile_url"] = "This URL is not available."

    if len(status_text) > MAX_STATUS_LENGTH:
        errors["status"] = f"Status must be {MAX_STATUS_LENGTH} characters or less."
    if len(bio) > MAX_BIO_LENGTH:
        errors["bio"] = f"Bio must be {MAX_BIO_LENGTH} characters or less."
    if len(location) > MAX_LOCATION_LENGTH:
        errors["location"] = "Location is too long."

    existing_interests = profile.interests if isinstance(profile.interests, list) else []
    existing_interests = existing_interests[:MAX_INTERESTS]
    cleaned_interests = existing_interests if interests_raw is None else clean_interests(interests_raw)
    if isinstance(interests_raw, list) and len(interests_raw) > MAX_INTERESTS:
        errors["interests"] = f"Add up to {MAX_INTERESTS} interests."
    if visibility not in {"public", "private"}:
        errors["visibility"] = "Visibility must be public or private."
    if theme not in {"system", "dark", "light"}:
        errors["theme"] = "Theme must be system, dark, or light."
    if not location:
        show_location = False

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    with transaction.atomic():
        if user.username != username:
            user.username = username
            user.save(update_fields=["username"])
        profile.display_name = display_name
        profile.profile_slug = profile_slug
        profile.status = status_text[:MAX_STATUS_LENGTH]
        profile.bio = bio[:MAX_BIO_LENGTH]
        profile.location = location
        profile.interests = cleaned_interests[:MAX_INTERESTS]
        profile.visibility = visibility
        profile.theme = theme
        profile.show_location = bool(show_location and profile.location)
        profile.allow_search = bool(allow_search)
        profile.save()

    return JsonResponse(
        {
            "profile": serialize_profile(profile, request),
            "user": serialize_user(user, request),
        }
    )


@csrf_exempt
@require_http_methods(["GET", "PATCH"])
def notification_settings(request: HttpRequest):
    """Fetch or update notification preferences for the authenticated user."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    profile = ensure_profile(session_token.user)

    if request.method == "GET":
        return JsonResponse({"notifications": serialize_notifications(profile)})

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    errors = {}

    def read_bool(*keys):
        for key in keys:
            if key in payload:
                return to_bool(payload.get(key))
        return None

    update_fields: list[str] = []

    email_pref = read_bool("email_notifications", "emailNotifications")
    if email_pref is not None:
        profile.email_notifications = email_pref
        update_fields.append("email_notifications")

    product_pref = read_bool("product_updates", "productUpdates")
    if product_pref is not None:
        profile.product_updates = product_pref
        update_fields.append("product_updates")

    new_follower_pref = read_bool("new_follower_alerts", "newFollowerAlerts")
    if new_follower_pref is not None:
        profile.new_follower_alerts = new_follower_pref
        update_fields.append("new_follower_alerts")

    weekly_digest_pref = read_bool("weekly_digest", "weeklyDigest")
    if weekly_digest_pref is not None:
        profile.weekly_digest = weekly_digest_pref
        update_fields.append("weekly_digest")

    pause_raw = None
    for key in ("pause_notifications", "pauseNotifications", "pause"):
        if key in payload:
            pause_raw = str(payload.get(key) or "").strip().lower()
            break
    if pause_raw is not None:
        if pause_raw not in {"off", "day", "week"}:
            errors["pause_notifications"] = "Pause must be off, day, or week."
        else:
            profile.pause_notifications = pause_raw
            if pause_raw == "off":
                profile.pause_until = None
            elif pause_raw == "day":
                profile.pause_until = timezone.now() + timedelta(days=1)
            else:
                profile.pause_until = timezone.now() + timedelta(days=7)
            update_fields.extend(["pause_notifications", "pause_until"])

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    if update_fields:
        profile.save(update_fields=list(set(update_fields)))

    return JsonResponse({"notifications": serialize_notifications(profile)})


@csrf_exempt
@require_http_methods(["GET"])
def username_availability(request: HttpRequest):
    """Check if a username is available (case-insensitive, reserved-aware)."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    user = session_token.user

    username = normalize_handle(request.GET.get("username") or "")
    error = validate_handle(username, "Username")
    if error:
        return JsonResponse({"available": False, "reason": error})

    taken = User.objects.filter(username__iexact=username).exclude(pk=user.pk).exists()
    return JsonResponse({"available": not taken, "reason": "" if not taken else "This username is already taken."})


@csrf_exempt
@require_http_methods(["GET"])
def profile_url_availability(request: HttpRequest):
    """Check if a profile URL slug is available (case-insensitive, reserved-aware)."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    user = session_token.user

    slug = normalize_handle(request.GET.get("profile_url") or request.GET.get("slug") or "")
    error = validate_handle(slug, "Profile URL")
    if error:
        return JsonResponse({"available": False, "reason": error})

    taken = Profile.objects.filter(profile_slug__iexact=slug).exclude(user=user).exists()
    return JsonResponse({"available": not taken, "reason": "" if not taken else "This URL is not available."})


def _cleanup_profile_photo(profile: Profile):
    """Remove the stored photo file and clear the field."""
    if not profile.photo:
        return
    profile.photo.delete(save=False)
    profile.photo = None
    profile.save(update_fields=["photo", "updated_at"])


def _safe_photo_name(user: User, filename: str) -> str:
    base, ext = os.path.splitext(filename or "upload.jpg")
    ext = ext if ext else ".jpg"
    token = secrets.token_hex(8)
    return str(Path("profile_photos") / f"user-{user.id}-{token}{ext}")


@csrf_exempt
@require_http_methods(["POST"])
def upload_profile_photo(request: HttpRequest):
    """Upload a profile photo and return its URL."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    user = session_token.user
    profile = ensure_profile(user)

    photo = request.FILES.get("photo") or request.FILES.get("file")
    if not photo:
        return JsonResponse({"detail": "No photo uploaded."}, status=400)

    if photo.size and photo.size > PHOTO_MAX_BYTES:
        return JsonResponse({"detail": "Photo is too large (max 5 MB)."}, status=400)
    content_type = (photo.content_type or "").lower()
    if not content_type.startswith("image/"):
        return JsonResponse({"detail": "Upload an image file."}, status=400)

    filename = _safe_photo_name(user, photo.name)
    old_photo_name = profile.photo.name if profile.photo else ""
    saved_path = default_storage.save(filename, photo)

    profile.photo.name = saved_path
    profile.save(update_fields=["photo", "updated_at"])

    if old_photo_name and old_photo_name != saved_path:
        default_storage.delete(old_photo_name)
    return JsonResponse({"photo_url": profile_photo_url(profile, request)})


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_profile_photo(request: HttpRequest):
    """Remove the current profile photo."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    session_token, auth_error = authenticate_session(request)
    if auth_error:
        return auth_error
    user = session_token.user
    profile = ensure_profile(user)

    _cleanup_profile_photo(profile)
    return JsonResponse({"photo_url": ""})


@csrf_exempt
@require_http_methods(["POST"])
def request_password_reset(request: HttpRequest):
    """Create a short-lived password reset token for a user."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    identifier = (payload.get("identifier") or payload.get("email") or payload.get("username") or "").strip()
    if not identifier:
        return JsonResponse({"errors": {"identifier": "Username or email is required."}}, status=400)

    user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
    if not user:
        return JsonResponse({"detail": "If an account exists, a reset token has been created."})

    expires_at = timezone.now() + timedelta(hours=1)
    PasswordResetToken.objects.filter(user=user, used_at__isnull=True).delete()

    key = secrets.token_urlsafe(32)
    while PasswordResetToken.objects.filter(key=key).exists():
        key = secrets.token_urlsafe(32)

    reset_token = PasswordResetToken.objects.create(user=user, key=key, expires_at=expires_at)
    return JsonResponse(
        {
            "reset_token": reset_token.key,
            "expires_at": reset_token.expires_at.isoformat(),
            "detail": "Password reset token created.",
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def reset_password(request: HttpRequest):
    """Reset a password using a valid reset token."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    token_key = (payload.get("token") or payload.get("reset_token") or "").strip()
    new_password = payload.get("password") or payload.get("new_password") or ""
    confirm = payload.get("confirm") or payload.get("confirm_password") or ""

    errors = {}
    if not token_key:
        errors["token"] = "Reset token is required."
    if not new_password:
        errors["password"] = "Password is required."
    elif len(new_password) < 8:
        errors["password"] = "Password must be at least 8 characters."
    if not confirm:
        errors["confirm"] = "Confirm your new password."
    elif new_password != confirm:
        errors["confirm"] = "Passwords do not match."

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    try:
        reset_token = PasswordResetToken.objects.select_related("user", "user__profile").get(key=token_key)
    except PasswordResetToken.DoesNotExist:
        return JsonResponse({"detail": "Invalid reset token."}, status=400)

    if reset_token.used_at is not None or reset_token.is_expired():
        if reset_token.is_expired() and reset_token.used_at is None:
            reset_token.delete()
        return JsonResponse({"detail": "Reset token is invalid or expired."}, status=400)

    user = reset_token.user
    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=["password"])
        reset_token.mark_used()
        SessionToken.objects.filter(user=user).delete()
        PasswordResetToken.objects.filter(user=user, used_at__isnull=True).exclude(pk=reset_token.pk).update(used_at=timezone.now())
        token = create_session_token(user, remember=False)

    return JsonResponse(
        {
            "token": token.key,
            "expires_at": token.expires_at.isoformat(),
            "user": serialize_user(user, request),
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def delete_account(request: HttpRequest):
    """Delete the authenticated user's account."""
    token_error = require_api_token(request)
    if token_error:
        return token_error

    payload, error_response = parse_json_body(request)
    if error_response:
        return error_response

    session_token, auth_error = authenticate_session(request, refresh=False)
    if auth_error:
        return auth_error
    user = session_token.user

    confirmation = (payload.get("confirm") or payload.get("confirmation") or "").strip()
    password = payload.get("password") or ""

    errors = {}
    if confirmation != "DELETE":
        errors["confirm"] = 'Type "DELETE" to confirm.'
    if password and not user.check_password(password):
        errors["password"] = "Incorrect password."

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    profile = ensure_profile(user)
    _cleanup_profile_photo(profile)
    SessionToken.objects.filter(user=user).delete()
    PasswordResetToken.objects.filter(user=user).delete()
    user.delete()

    response = JsonResponse({"detail": "Account deleted."})
    response.delete_cookie("session_token")
    return response
