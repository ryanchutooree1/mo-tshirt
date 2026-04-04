import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import 'tuya_iot_models.dart';

class TuyaIotService {
  TuyaIotService({
    MethodChannel? channel,
    http.Client? httpClient,
    String? siteBaseUrl,
  }) : _channel = channel ?? const MethodChannel('mo_tshirt/tuya_iot'),
       _httpClient = httpClient ?? http.Client(),
       _siteBaseUrl = siteBaseUrl ?? 'https://www.mo-tshirt.mu';

  final MethodChannel _channel;
  final http.Client _httpClient;
  final String _siteBaseUrl;

  Future<TuyaSdkStatus> getSdkStatus() async {
    final Map<Object?, Object?> map =
        await _channel.invokeMapMethod<Object?, Object?>('getSdkStatus') ??
        <Object?, Object?>{};
    return TuyaSdkStatus.fromMap(map);
  }

  Future<String> startPairing(TuyaPairingRequest request) async {
    final String? result = await _channel.invokeMethod<String>(
      'startPairing',
      request.toMap(),
    );

    return result ?? 'Pairing was started on the native Tuya bridge.';
  }

  Future<List<TuyaDevice>> loadCloudDevices() async {
    final Uri uri = Uri.parse('$_siteBaseUrl/api/tuya/devices');
    final http.Response response = await _httpClient.get(
      uri,
      headers: const <String, String>{'Accept': 'application/json'},
    );

    final Map<String, dynamic> body = _decodeMap(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        (body['error'] ?? body['message'] ?? 'Failed to load Tuya devices.')
            .toString(),
      );
    }

    if (body['hasKeys'] == false) {
      throw Exception(
        (body['message'] ?? 'Tuya keys are missing on the server.').toString(),
      );
    }

    final List<TuyaDevice> devices =
        (body['devices'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(TuyaDevice.fromApiJson)
            .toList(growable: false);

    devices.sort((TuyaDevice left, TuyaDevice right) {
      final int powerDelta =
          (right.primaryPowerDatapoint != null ? 1 : 0) -
          (left.primaryPowerDatapoint != null ? 1 : 0);
      if (powerDelta != 0) {
        return powerDelta;
      }

      final int breakerDelta =
          (right.looksLikeBreaker ? 1 : 0) - (left.looksLikeBreaker ? 1 : 0);
      if (breakerDelta != 0) {
        return breakerDelta;
      }

      return left.name.compareTo(right.name);
    });

    return devices;
  }

  Future<TuyaDevice> refreshCloudDevice(String deviceId) async {
    final Uri uri = Uri.parse(
      '$_siteBaseUrl/api/tuya/device/${Uri.encodeComponent(deviceId)}/status',
    );
    final http.Response response = await _httpClient.get(
      uri,
      headers: const <String, String>{'Accept': 'application/json'},
    );
    final Map<String, dynamic> body = _decodeMap(response.body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        (body['error'] ?? body['message'] ?? 'Failed to refresh device.')
            .toString(),
      );
    }

    return TuyaDevice.fromApiJson(<String, dynamic>{
      'id': deviceId,
      'name': body['name'] ?? 'Tuya device',
      'online': body['online'],
      'status': body['status'],
      'lastFetchedAt': body['lastFetchedAt'],
      'error': body['error'],
    });
  }

  Future<void> sendCloudCommand({
    required String deviceId,
    required String code,
    required bool value,
  }) async {
    final Uri uri = Uri.parse(
      '$_siteBaseUrl/api/tuya/device/${Uri.encodeComponent(deviceId)}/command',
    );

    final http.Response response = await _httpClient.post(
      uri,
      headers: const <String, String>{
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(<String, Object?>{'code': code, 'value': value}),
    );

    final Map<String, dynamic> body = _decodeMap(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        (body['error'] ?? body['message'] ?? 'Failed to send Tuya command.')
            .toString(),
      );
    }
  }

  Map<String, dynamic> _decodeMap(String body) {
    if (body.trim().isEmpty) {
      return <String, dynamic>{};
    }

    final dynamic decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }

    throw const FormatException('Invalid JSON response.');
  }
}
