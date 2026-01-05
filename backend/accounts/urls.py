from django.urls import path

from . import views

urlpatterns = [
    path("signup/", views.signup, name="api-signup"),
    path("login/", views.login, name="api-login"),
    path("session/", views.session, name="api-session"),
    path("logout/", views.logout, name="api-logout"),
    path("logout/all/", views.logout_all, name="api-logout-all"),
    path("email/", views.change_email, name="api-change-email"),
    path("password/change/", views.change_password, name="api-password-change"),
    path("password/reset/request/", views.request_password_reset, name="api-password-reset-request"),
    path("password/reset/", views.reset_password, name="api-password-reset"),
    path("delete/", views.delete_account, name="api-delete-account"),
    path("profile/", views.profile_settings, name="api-profile"),
    path("profile/username/", views.username_availability, name="api-username-availability"),
    path("profile/url/", views.profile_url_availability, name="api-profile-url-availability"),
    path("profile/photo/", views.upload_profile_photo, name="api-profile-photo-upload"),
    path("profile/photo/delete/", views.delete_profile_photo, name="api-profile-photo-delete"),
    path("notifications/", views.notification_settings, name="api-notifications"),
]
