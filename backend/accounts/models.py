from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    display_name = models.CharField(max_length=150)
    profile_slug = models.CharField(max_length=50, unique=True, null=True, blank=True)
    status = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    location = models.CharField(max_length=120, blank=True)
    interests = models.JSONField(default=list, blank=True)
    photo = models.FileField(upload_to="profile_photos/", null=True, blank=True)
    visibility = models.CharField(
        max_length=16,
        choices=[("public", "Public"), ("private", "Private")],
        default="public",
    )
    theme = models.CharField(
        max_length=16,
        choices=[("system", "System"), ("dark", "Dark"), ("light", "Light")],
        default="system",
    )
    show_location = models.BooleanField(default=False)
    allow_search = models.BooleanField(default=False)
    email_notifications = models.BooleanField(default=True)
    product_updates = models.BooleanField(default=True)
    new_follower_alerts = models.BooleanField(default=False)
    weekly_digest = models.BooleanField(default=False)
    pause_notifications = models.CharField(
        max_length=10,
        choices=[("off", "Off"), ("day", "Pause for 1 day"), ("week", "Pause for 1 week")],
        default="off",
    )
    pause_until = models.DateTimeField(null=True, blank=True)
    agreed_to_terms_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        handle = self.profile_slug or self.user.username
        return f"{self.display_name} (@{handle})"


class SessionToken(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="session_tokens",
    )
    key = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["key"])]

    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return timezone.now() >= self.expires_at

    def refresh_expiry(self, remember: bool | None = None) -> None:
        """Extend expiry on demand."""
        if remember is None and self.expires_at:
            remember = (self.expires_at - timezone.now()) > timedelta(days=2)
        lifetime = timedelta(days=30) if remember else timedelta(days=1)
        self.expires_at = timezone.now() + lifetime
        self.save(update_fields=["expires_at"])

    def __str__(self) -> str:
        return f"Token for {self.user.username}"


class PasswordResetToken(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    key = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["key"])]

    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])

    def __str__(self) -> str:
        return f"Password reset for {self.user.username}"

# Create your models here.
