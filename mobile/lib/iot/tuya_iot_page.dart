import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tuya_iot_models.dart';
import 'tuya_iot_service.dart';

const Color _iotOrange = Color(0xFFFF6600);
const Color _iotCream = Color(0xFFFFFBF8);
const Color _iotInk = Color(0xFF171717);

class TuyaIotPage extends StatefulWidget {
  TuyaIotPage({super.key, TuyaIotService? service})
    : service = service ?? TuyaIotService();

  final TuyaIotService service;

  @override
  State<TuyaIotPage> createState() => _TuyaIotPageState();
}

class _TuyaIotPageState extends State<TuyaIotPage> {
  final TextEditingController _ssidController = TextEditingController(
    text: 'mo-tshirt.mu',
  );
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _homeNameController = TextEditingController(
    text: 'MO T-SHIRT Home',
  );

  TuyaPairingMode _pairingMode = TuyaPairingMode.ez;
  TuyaSdkStatus? _sdkStatus;
  bool _checkingSdk = true;
  bool _startingPair = false;
  bool _loadingDevices = false;
  final Map<String, bool> _commandBusy = <String, bool>{};
  final Map<String, bool> _refreshBusy = <String, bool>{};
  final Map<String, String> _deviceFeedback = <String, String>{};
  List<TuyaDevice> _devices = <TuyaDevice>[];
  String? _pairingFeedback;
  String? _cloudFeedback;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _ssidController.dispose();
    _passwordController.dispose();
    _homeNameController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await Future.wait(<Future<void>>[_loadSdkStatus(), _loadDevices()]);
  }

  Future<void> _loadSdkStatus() async {
    setState(() {
      _checkingSdk = true;
    });

    try {
      final TuyaSdkStatus status = await widget.service.getSdkStatus();
      if (!mounted) {
        return;
      }
      setState(() {
        _sdkStatus = status;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _sdkStatus = TuyaSdkStatus(
          platform: 'flutter',
          configured: false,
          appKeyPresent: false,
          appSecretPresent: false,
          sdkLinked: false,
          missingItems: const <String>['Native bridge error'],
          message: error.toString().replaceFirst('Exception: ', ''),
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _checkingSdk = false;
        });
      }
    }
  }

  Future<void> _loadDevices() async {
    setState(() {
      _loadingDevices = true;
      _cloudFeedback = null;
    });

    try {
      final List<TuyaDevice> devices = await widget.service.loadCloudDevices();
      if (!mounted) {
        return;
      }
      setState(() {
        _devices = devices;
        _cloudFeedback = devices.isEmpty
            ? 'No Tuya devices were returned from the server yet.'
            : 'Loaded ${devices.length} Tuya device${devices.length == 1 ? '' : 's'} from the cloud.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _cloudFeedback = error.toString().replaceFirst('Exception: ', '');
        _devices = <TuyaDevice>[];
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingDevices = false;
        });
      }
    }
  }

  Future<void> _startPairing() async {
    final String ssid = _ssidController.text.trim();
    final String password = _passwordController.text.trim();
    final String homeName = _homeNameController.text.trim();

    if (ssid.isEmpty || password.isEmpty || homeName.isEmpty) {
      setState(() {
        _pairingFeedback =
            'Enter the Wi-Fi name, password, and a Tuya home name first.';
      });
      return;
    }

    setState(() {
      _startingPair = true;
      _pairingFeedback = null;
    });

    try {
      final String message = await widget.service.startPairing(
        TuyaPairingRequest(
          ssid: ssid,
          password: password,
          homeName: homeName,
          mode: _pairingMode,
        ),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _pairingFeedback = message;
      });
      await _loadSdkStatus();
      await _loadDevices();
    } on PlatformException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _pairingFeedback = error.message ?? error.code;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _pairingFeedback = error.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _startingPair = false;
        });
      }
    }
  }

  Future<void> _refreshDevice(TuyaDevice device) async {
    setState(() {
      _refreshBusy[device.id] = true;
      _deviceFeedback[device.id] = '';
    });

    try {
      final TuyaDevice refreshed = await widget.service.refreshCloudDevice(
        device.id,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _replaceDevice(
          device.id,
          TuyaDevice(
            id: device.id,
            name: device.name,
            online: refreshed.online,
            lastFetchedAt: refreshed.lastFetchedAt,
            error: refreshed.error,
            status: refreshed.status,
          ),
        );
        _deviceFeedback[device.id] = 'Status refreshed.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _deviceFeedback[device.id] = error.toString().replaceFirst(
          'Exception: ',
          '',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _refreshBusy[device.id] = false;
        });
      }
    }
  }

  Future<void> _toggleDevice(TuyaDevice device) async {
    final TuyaPowerDatapoint? datapoint = device.primaryPowerDatapoint;
    if (datapoint == null || datapoint.code.isEmpty) {
      setState(() {
        _deviceFeedback[device.id] =
            'This Tuya device has no boolean switch datapoint available.';
      });
      return;
    }

    final bool nextValue = !datapoint.value;
    setState(() {
      _commandBusy[device.id] = true;
      _deviceFeedback[device.id] = '';
    });

    try {
      await widget.service.sendCloudCommand(
        deviceId: device.id,
        code: datapoint.code,
        value: nextValue,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _deviceFeedback[device.id] = nextValue
            ? 'Breaker turned on.'
            : 'Breaker turned off.';
      });
      await _refreshDevice(device);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _deviceFeedback[device.id] = error.toString().replaceFirst(
          'Exception: ',
          '',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _commandBusy[device.id] = false;
        });
      }
    }
  }

  void _replaceDevice(String deviceId, TuyaDevice replacement) {
    _devices = _devices
        .map((TuyaDevice device) {
          if (device.id == deviceId) {
            return replacement;
          }
          return device;
        })
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final TuyaSdkStatus? status = _sdkStatus;

    return RefreshIndicator(
      color: _iotOrange,
      onRefresh: _bootstrap,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
        children: <Widget>[
          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Smart breaker setup',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: _iotInk,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'This Flutter tab is the correct place for Tuya-style onboarding. It can collect the 2.4 GHz Wi-Fi details, launch native pairing, then control the breaker from the same mobile app.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.black54,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 18),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: <Widget>[
                    _StatusChip(
                      icon: Icons.electrical_services_rounded,
                      label: 'Breaker (Wi-Fi)',
                      tone: _StatusChipTone.accent,
                    ),
                    _StatusChip(
                      icon: Icons.wifi_rounded,
                      label: _pairingMode == TuyaPairingMode.ez
                          ? 'Blink slowly'
                          : 'Blink quickly',
                      tone: _StatusChipTone.neutral,
                    ),
                    _StatusChip(
                      icon: Icons.cloud_done_rounded,
                      label:
                          '${_devices.length} cloud device${_devices.length == 1 ? '' : 's'}',
                      tone: _StatusChipTone.neutral,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        'Native Tuya SDK status',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _checkingSdk ? null : _loadSdkStatus,
                      tooltip: 'Refresh SDK status',
                      icon: _checkingSdk
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.refresh_rounded),
                    ),
                  ],
                ),
                if (status != null) ...<Widget>[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: <Widget>[
                      _StatusChip(
                        icon: status.configured
                            ? Icons.check_circle_rounded
                            : Icons.error_outline_rounded,
                        label: status.configured
                            ? 'Configured'
                            : 'Not configured',
                        tone: status.configured
                            ? _StatusChipTone.success
                            : _StatusChipTone.warn,
                      ),
                      _StatusChip(
                        icon: Icons.key_rounded,
                        label: status.appKeyPresent
                            ? 'App key set'
                            : 'App key missing',
                        tone: status.appKeyPresent
                            ? _StatusChipTone.success
                            : _StatusChipTone.warn,
                      ),
                      _StatusChip(
                        icon: Icons.lock_rounded,
                        label: status.appSecretPresent
                            ? 'App secret set'
                            : 'App secret missing',
                        tone: status.appSecretPresent
                            ? _StatusChipTone.success
                            : _StatusChipTone.warn,
                      ),
                      _StatusChip(
                        icon: Icons.developer_mode_rounded,
                        label: status.sdkLinked
                            ? 'Native SDK linked'
                            : 'Native SDK not linked',
                        tone: status.sdkLinked
                            ? _StatusChipTone.success
                            : _StatusChipTone.warn,
                      ),
                    ],
                  ),
                  if (status.message.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 14),
                    Text(
                      status.message,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.black54,
                      ),
                    ),
                  ],
                  if (status.missingItems.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 14),
                    ...status.missingItems.map(
                      (String item) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const Padding(
                              padding: EdgeInsets.only(top: 4),
                              child: Icon(
                                Icons.circle,
                                size: 8,
                                color: Colors.black38,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                item,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: Colors.black54,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Pair the breaker on this phone',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Use the same 2.4 GHz network as the breaker. Slow blink usually means EZ mode. Fast blink usually means AP mode.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.black54,
                  ),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _homeNameController,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Tuya home name',
                    hintText: 'Example: MO T-SHIRT Home',
                    prefixIcon: Icon(Icons.home_work_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _ssidController,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: '2.4 GHz Wi-Fi',
                    hintText: 'Example: mo-tshirt.mu',
                    prefixIcon: Icon(Icons.wifi_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Wi-Fi password',
                    hintText: 'Enter the router password',
                    prefixIcon: Icon(Icons.lock_outline_rounded),
                  ),
                ),
                const SizedBox(height: 18),
                SegmentedButton<TuyaPairingMode>(
                  segments: const <ButtonSegment<TuyaPairingMode>>[
                    ButtonSegment<TuyaPairingMode>(
                      value: TuyaPairingMode.ez,
                      icon: Icon(Icons.lightbulb_outline_rounded),
                      label: Text('Blink slowly'),
                    ),
                    ButtonSegment<TuyaPairingMode>(
                      value: TuyaPairingMode.ap,
                      icon: Icon(Icons.flash_on_rounded),
                      label: Text('Blink quickly'),
                    ),
                  ],
                  selected: <TuyaPairingMode>{_pairingMode},
                  onSelectionChanged: (Set<TuyaPairingMode> selection) {
                    setState(() {
                      _pairingMode = selection.first;
                    });
                  },
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _startingPair ? null : _startPairing,
                    style: FilledButton.styleFrom(
                      backgroundColor: _iotOrange,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    icon: _startingPair
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.router_rounded),
                    label: const Text('Start Tuya pairing'),
                  ),
                ),
                if (_pairingFeedback != null) ...<Widget>[
                  const SizedBox(height: 14),
                  _InlineNotice(
                    icon: Icons.info_outline_rounded,
                    text: _pairingFeedback!,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          _SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        'Cloud devices and on/off control',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _loadingDevices ? null : _loadDevices,
                      icon: _loadingDevices
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.refresh_rounded),
                      label: const Text('Refresh'),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  'After a device is paired in Tuya, this mobile tab can fetch it from your existing cloud API and switch it on or off.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.black54,
                  ),
                ),
                if (_cloudFeedback != null) ...<Widget>[
                  const SizedBox(height: 14),
                  _InlineNotice(
                    icon: Icons.cloud_outlined,
                    text: _cloudFeedback!,
                  ),
                ],
                const SizedBox(height: 14),
                if (_devices.isEmpty && !_loadingDevices)
                  const _EmptyDeviceState()
                else
                  ..._devices.map((TuyaDevice device) {
                    final TuyaPowerDatapoint? power =
                        device.primaryPowerDatapoint;
                    final bool isBusy = _commandBusy[device.id] == true;
                    final bool isRefreshing = _refreshBusy[device.id] == true;
                    final bool isOn = power?.value == true;

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                          color: Colors.white,
                          border: Border.all(color: const Color(0xFFFFE2CE)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(
                                        device.name,
                                        style: theme.textTheme.titleMedium
                                            ?.copyWith(
                                              fontWeight: FontWeight.w800,
                                            ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        device.id,
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(color: Colors.black45),
                                      ),
                                    ],
                                  ),
                                ),
                                _ConnectionPill(online: device.online),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: <Widget>[
                                _StatusChip(
                                  icon: Icons.power_settings_new_rounded,
                                  label: power == null
                                      ? 'No switch DP'
                                      : (isOn ? 'Power on' : 'Power off'),
                                  tone: power == null
                                      ? _StatusChipTone.warn
                                      : (isOn
                                            ? _StatusChipTone.success
                                            : _StatusChipTone.neutral),
                                ),
                                if (power != null)
                                  _StatusChip(
                                    icon: Icons.tune_rounded,
                                    label: 'DP ${power.code}',
                                    tone: _StatusChipTone.neutral,
                                  ),
                                _StatusChip(
                                  icon: Icons.memory_rounded,
                                  label: device.looksLikeBreaker
                                      ? 'Breaker-like'
                                      : 'Tuya device',
                                  tone: _StatusChipTone.neutral,
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            Row(
                              children: <Widget>[
                                Expanded(
                                  child: FilledButton.icon(
                                    onPressed: isBusy || power == null
                                        ? null
                                        : () => _toggleDevice(device),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: isOn
                                          ? const Color(0xFF109868)
                                          : _iotInk,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 14,
                                      ),
                                    ),
                                    icon: isBusy
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : const Icon(
                                            Icons.power_settings_new_rounded,
                                          ),
                                    label: Text(isOn ? 'Turn off' : 'Turn on'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                OutlinedButton.icon(
                                  onPressed: isRefreshing
                                      ? null
                                      : () => _refreshDevice(device),
                                  icon: isRefreshing
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.refresh_rounded),
                                  label: const Text('Refresh'),
                                ),
                              ],
                            ),
                            if (device.error != null &&
                                device.error!.isNotEmpty) ...<Widget>[
                              const SizedBox(height: 12),
                              Text(
                                device.error!,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: Colors.redAccent,
                                ),
                              ),
                            ],
                            if ((_deviceFeedback[device.id] ?? '')
                                .isNotEmpty) ...<Widget>[
                              const SizedBox(height: 12),
                              Text(
                                _deviceFeedback[device.id]!,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: Colors.black54,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFFFFE2CE)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x12FF6600),
            blurRadius: 24,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Padding(padding: const EdgeInsets.all(20), child: child),
    );
  }
}

class _InlineNotice extends StatelessWidget {
  const _InlineNotice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _iotCream,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: _iotOrange),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.black54,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectionPill extends StatelessWidget {
  const _ConnectionPill({required this.online});

  final bool? online;

  @override
  Widget build(BuildContext context) {
    final bool isOnline = online == true;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: isOnline ? const Color(0x1A109868) : const Color(0x12FF6600),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded,
            size: 16,
            color: isOnline ? const Color(0xFF109868) : _iotOrange,
          ),
          const SizedBox(width: 6),
          Text(
            isOnline ? 'Online' : 'Offline',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: isOnline ? const Color(0xFF109868) : _iotOrange,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyDeviceState extends StatelessWidget {
  const _EmptyDeviceState();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: const Color(0xFFFFFBF8),
      ),
      child: Column(
        children: <Widget>[
          const Icon(Icons.device_hub_rounded, size: 32, color: _iotOrange),
          const SizedBox(height: 10),
          Text(
            'No Tuya devices available yet.',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'Pair the breaker in Tuya first or complete the native SDK setup so this app can start onboarding directly.',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: Colors.black54),
          ),
        ],
      ),
    );
  }
}

enum _StatusChipTone { accent, success, warn, neutral }

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.icon,
    required this.label,
    required this.tone,
  });

  final IconData icon;
  final String label;
  final _StatusChipTone tone;

  @override
  Widget build(BuildContext context) {
    late final Color background;
    late final Color foreground;

    switch (tone) {
      case _StatusChipTone.accent:
        background = const Color(0x14FF6600);
        foreground = _iotOrange;
      case _StatusChipTone.success:
        background = const Color(0x1A109868);
        foreground = const Color(0xFF109868);
      case _StatusChipTone.warn:
        background = const Color(0x18C96A00);
        foreground = const Color(0xFFC96A00);
      case _StatusChipTone.neutral:
        background = const Color(0xFFF4EFEA);
        foreground = const Color(0xFF4C4C52);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 16, color: foreground),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: foreground,
            ),
          ),
        ],
      ),
    );
  }
}
