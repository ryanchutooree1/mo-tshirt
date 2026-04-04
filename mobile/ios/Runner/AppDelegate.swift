import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let tuyaChannelName = "mo_tshirt/tuya_iot"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    guard let controller = window?.rootViewController as? FlutterViewController else {
      return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
    let channel = FlutterMethodChannel(
      name: tuyaChannelName,
      binaryMessenger: controller.binaryMessenger
    )

    channel.setMethodCallHandler { [weak self] call, result in
      switch call.method {
      case "getSdkStatus":
        result(self?.getSdkStatus())
      case "startPairing":
        result(
          FlutterError(
            code: "tuya_sdk_missing",
            message: "Tuya native iOS pairing is not linked yet. Add the Tuya iOS Smart App SDK pods, set TuyaAppKey and TuyaAppSecret in Info.plist, then implement the activator flow here.",
            details: nil
          )
        )
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }

  private func getSdkStatus() -> [String: Any] {
    let appKey = (Bundle.main.object(forInfoDictionaryKey: "TuyaAppKey") as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let appSecret = (Bundle.main.object(forInfoDictionaryKey: "TuyaAppSecret") as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let appKeyPresent = !appKey.isEmpty
    let appSecretPresent = !appSecret.isEmpty
    let sdkLinked = false

    var missingItems: [String] = []
    if !appKeyPresent {
      missingItems.append("Info.plist key TuyaAppKey is empty.")
    }
    if !appSecretPresent {
      missingItems.append("Info.plist key TuyaAppSecret is empty.")
    }
    if !sdkLinked {
      missingItems.append("Tuya iOS Smart App SDK pods are not added in Podfile yet.")
    }

    return [
      "platform": "ios",
      "configured": appKeyPresent && appSecretPresent && sdkLinked,
      "appKeyPresent": appKeyPresent,
      "appSecretPresent": appSecretPresent,
      "sdkLinked": sdkLinked,
      "missingItems": missingItems,
      "message": "This Flutter app now exposes a native Tuya bridge point. Actual Wi-Fi breaker onboarding still needs the Tuya iOS SDK activator flow wired into this channel.",
    ]
  }
}
