from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_profile_allow_search_profile_show_location_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="email_notifications",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="profile",
            name="product_updates",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="profile",
            name="new_follower_alerts",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="profile",
            name="weekly_digest",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="profile",
            name="pause_notifications",
            field=models.CharField(
                choices=[("off", "Off"), ("day", "Pause for 1 day"), ("week", "Pause for 1 week")],
                default="off",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="profile",
            name="pause_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
