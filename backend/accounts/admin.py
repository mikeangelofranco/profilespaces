from django.contrib import admin

from .models import Profile, SessionToken


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "status", "agreed_to_terms_at", "created_at")
    search_fields = ("user__username", "user__email", "display_name")


@admin.register(SessionToken)
class SessionTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "key", "expires_at", "created_at")
    search_fields = ("user__username", "key")
