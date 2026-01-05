from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_profile_notifications"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="theme",
            field=models.CharField(
                choices=[("system", "System"), ("dark", "Dark"), ("light", "Light")],
                default="system",
                max_length=16,
            ),
        ),
    ]
