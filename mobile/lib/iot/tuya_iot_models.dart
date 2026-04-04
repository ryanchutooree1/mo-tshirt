class TuyaSdkStatus {
  const TuyaSdkStatus({
    required this.platform,
    required this.configured,
    required this.appKeyPresent,
    required this.appSecretPresent,
    required this.sdkLinked,
    required this.missingItems,
    required this.message,
  });

  factory TuyaSdkStatus.fromMap(Map<Object?, Object?> map) {
    return TuyaSdkStatus(
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

enum TuyaPairingMode {
  ez('ez', 'Blink slowly'),
  ap('ap', 'Blink quickly');

  const TuyaPairingMode(this.value, this.label);

  final String value;
  final String label;
}

class TuyaPairingRequest {
  const TuyaPairingRequest({
    required this.ssid,
    required this.password,
    required this.homeName,
    required this.mode,
  });

  final String ssid;
  final String password;
  final String homeName;
  final TuyaPairingMode mode;

  Map<String, Object?> toMap() {
    return <String, Object?>{
      'ssid': ssid,
      'password': password,
      'homeName': homeName,
      'mode': mode.value,
    };
  }
}

class TuyaPowerDatapoint {
  const TuyaPowerDatapoint({required this.code, required this.value});

  final String code;
  final bool value;
}

class TuyaDevice {
  const TuyaDevice({
    required this.id,
    required this.name,
    required this.online,
    required this.lastFetchedAt,
    required this.error,
    required this.status,
  });

  factory TuyaDevice.fromApiJson(Map<String, dynamic> json) {
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

    return TuyaDevice(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Tuya device',
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

  TuyaPowerDatapoint? get primaryPowerDatapoint {
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
        return TuyaPowerDatapoint(
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
