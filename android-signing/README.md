# Ondertekening van de APK

`public-test.p12` (wachtwoord `mpctouchstudio`, alias `mpc`) is een **openbare test-sleutel**, net als een Android debug-sleutel.
Daarmee installeert elke nieuwe APK als update over de vorige heen. Prima voor eigen gebruik (sideloaden).

Wil je de app via de Play Store of aan anderen verspreiden? Maak dan je eigen sleutel en zet in GitHub
(Settings → Secrets and variables → Actions) de geheimen `ANDROID_KEYSTORE_B64` (base64 van je .p12/.jks),
`ANDROID_KEYSTORE_PASSWORD` en eventueel `ANDROID_KEY_ALIAS` (standaard `mpc`). De workflow gebruikt die dan automatisch.
Let op: een APK met een andere sleutel installeert niet over een met de test-sleutel; verwijder dan eerst de oude app.
