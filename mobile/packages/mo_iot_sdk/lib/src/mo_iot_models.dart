class MoIotSdkStatus {
  const MoIotSdkStatus({
    required this.platform,
    required this.configured,
    required this.appKeyPresent,
    required this.appSecretPresent,
    required this.sdkLinked,
    required this.missingItems,
    required this.message,
  });

  factory MoIotSdkStatus.fromMap(Map<Object?, Object?> map) {
    return MoIotSdkStatus(
      platform: (map['platform'] ?? 'unknown').toString(),
      configured: map['configured'] == true,
      appKeyPresent: map['appKeyPresent'] == true,
      appSecretPresent: map['appSecretPresent'] == true,
      sdkLinked: map['sdkLinked'] == true,
      missingItems: (map['missingItems'] as List<Object?>? ?? <Object?>[])
          .map((Object? item) => item.toString())
          .toList(growable: false),
      message: (map['message'] ?? '').toString(),
    );
  }

  final String platform;
  final bool configured;
  final bool appKeyPresent;
  final bool appSecretPresent;
  final bool sdkLinked;
  final List<String> missingItems;
  final String message;
}

enum MoPairingMode {
  ez('ez', 'Blink slowly'),
  ap('ap', 'Blink quickly');

  const MoPairingMode(this.value, this.label);

  final String value;
  final String label;
}

class MoPairingRequest {
  const MoPairingRequest({
    required this.ssid,
    required this.password,
    required this.homeName,
    required this.mode,
  });

  final String ssid;
  final String password;
  final String homeName;
  final MoPairingMode mode;

  Map<String, Object?> toMap() {
    return <String, Object?>{
      'ssid': ssid,
      'password': password,
      'homeName': homeName,
      'mode': mode.value,
    };
  }
}

class MoDevicePowerDatapoint {
  const MoDevicePowerDatapoint({required this.code, required this.value});

  final String code;
  final bool value;
}

class MoIotDevice {
  const MoIotDevice({
    required this.id,
    required this.name,
    required this.online,
    required this.lastFetchedAt,
    required this.error,
    required this.status,
  });

  factory MoIotDevice.fromApiJson(Map<String, dynamic> json) {
    final List<Map<String, dynamic>> normalizedStatus =
        (json['status'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(
              (Map<String, dynamic> item) => <String, dynamic>{
                'code': item['code']?.toString() ?? '',
                'value': item['value'],
              },
            )
            .toList(growable: false);

    return MoIotDevice(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'MO IoT device',
      online: json['online'] == null ? null : json['online'] == true,
      lastFetchedAt: json['lastFetchedAt']?.toString() ?? '',
      error: json['error']?.toString(),
      status: normalizedStatus,
    );
  }

  final String id;
  final String name;
  final bool? online;
  final String lastFetchedAt;
  final String? error;
  final List<Map<String, dynamic>> status;

  MoDevicePowerDatapoint? get primaryPowerDatapoint {
    final Iterable<Map<String, dynamic>> candidates = <Map<String, dynamic>>[
      ...status.where(
        (Map<String, dynamic> item) => item['code'] == 'switch_1',
      ),
      ...status.where((Map<String, dynamic> item) => item['code'] == 'switch'),
      ...status.where(
        (Map<String, dynamic> item) =>
            item['code']?.toString().startsWith('switch_') == true,
      ),
      ...status,
    ];

    for (final Map<String, dynamic> item in candidates) {
      final Object? value = item['value'];
      if (value is bool) {
        return MoDevicePowerDatapoint(
          code: item['code']?.toString() ?? '',
          value: value,
        );
      }
    }

    return null;
  }

  bool get looksLikeBreaker {
    final String normalized = name.toLowerCase();
    return normalized.contains('breaker') ||
        normalized.contains('switch') ||
        normalized.contains('relay') ||
        normalized.contains('power');
  }
}
