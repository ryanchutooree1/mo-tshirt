# mo_tshirt_mobile

Mobile app for MO T-SHIRT.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Official Tuya App Bridge on iPhone

The IoT tab now includes a local Shortcut bridge for the official Tuya iPhone app.

Use it when you cannot call Tuya cloud APIs directly:

1. In the official Tuya app on your iPhone, create a `Tap-to-Run` scene for turning the light on.
2. Create another `Tap-to-Run` scene for turning the light off.
3. Add both scenes to Siri/Shortcuts on the iPhone.
4. In the Flutter app IoT tab, enter the exact shortcut names into the `On shortcut name` and `Off shortcut name` fields.
5. Use the `Run on`, `Run off`, or `Run command` controls.

Example command text:

- `turn on ggt light`
- `turn off ggt light`

Important:

- This bridge works on iPhone only because it launches the iOS Shortcuts app.
- It does not silently automate the Tuya UI; it runs the shortcuts you created from the official Tuya app.
