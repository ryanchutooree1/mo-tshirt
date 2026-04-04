package mu.motshirt.mo_tshirt_mobile

import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "mo_tshirt/tuya_iot"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getSdkStatus" -> result.success(getSdkStatus())
                    "startPairing" -> result.error(
                        "tuya_sdk_missing",
                        "Tuya native Android pairing is not linked yet. Add the Tuya Android Smart App SDK, set TUYA_APP_KEY and TUYA_APP_SECRET in AndroidManifest metadata, then implement the activator flow here.",
                        null,
                    )

                    else -> result.notImplemented()
                }
            }
    }

    private fun getSdkStatus(): Map<String, Any> {
        val appKey = readMetadata("TUYA_APP_KEY")
        val appSecret = readMetadata("TUYA_APP_SECRET")
        val appKeyPresent = appKey.isNotBlank()
        val appSecretPresent = appSecret.isNotBlank()
        val sdkLinked = false

        val missingItems = mutableListOf<String>()
        if (!appKeyPresent) {
            missingItems.add("AndroidManifest meta-data TUYA_APP_KEY is empty.")
        }
        if (!appSecretPresent) {
            missingItems.add("AndroidManifest meta-data TUYA_APP_SECRET is empty.")
        }
        if (!sdkLinked) {
            missingItems.add("Tuya Android Smart App SDK dependencies are not added in Gradle yet.")
        }

        return mapOf(
            "platform" to "android",
            "configured" to (appKeyPresent && appSecretPresent && sdkLinked),
            "appKeyPresent" to appKeyPresent,
            "appSecretPresent" to appSecretPresent,
            "sdkLinked" to sdkLinked,
            "missingItems" to missingItems,
            "message" to "This Flutter app now exposes a native Tuya bridge point. Actual Wi-Fi breaker onboarding still needs the Tuya Android SDK activator flow wired into this channel."
        )
    }

    private fun readMetadata(key: String): String {
        return try {
            val appInfo = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
            appInfo.metaData?.getString(key)?.trim().orEmpty()
        } catch (_: Exception) {
            ""
        }
    }
}
