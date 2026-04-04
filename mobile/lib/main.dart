import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

const Color _brandOrange = Color(0xFFFF6600);
const Color _brandCream = Color(0xFFFFFBF8);
const Color _brandInk = Color(0xFF171717);
const Color _brandSand = Color(0xFFF4EFEA);

const String _siteBaseUrl = 'https://www.mo-tshirt.mu';
const String _shopApiUrl = '$_siteBaseUrl/api/shops';
const String _quoteOptionsApiUrl = '$_siteBaseUrl/api/quote-options';
const String _contactApiUrl = '$_siteBaseUrl/api/contact';

final Uri _websiteUri = Uri.parse(_siteBaseUrl);
final Uri _whatsAppUri =
    Uri.parse('https://wa.me/23059883880?text=Hi%2C%20I%20need%20printing.');
final Uri _phoneUri = Uri.parse('tel:+23059883880');
final Uri _emailUri = Uri.parse('mailto:motshirtmauritius@gmail.com');

const List<String> _quoteGarmentOptions = <String>[
  'T-Shirt',
  'Poloshirt',
  'Hoodie',
  'Cap',
  'Other',
];

const List<DeliveryMethod> _deliveryMethods = <DeliveryMethod>[
  DeliveryMethod(
    value: 'Surinam pickup',
    label: 'Surinam Pickup (Free)',
    fee: 0,
  ),
  DeliveryMethod(
    value: 'Post Office Postage Delivery',
    label: 'Post Office Postage Delivery (Rs 100)',
    fee: 100,
  ),
  DeliveryMethod(
    value: 'Post Office Express Delivery',
    label: 'Post Office Express Delivery (Rs 150)',
    fee: 150,
  ),
  DeliveryMethod(
    value: 'Delivery (Need to arrange first)',
    label: 'Delivery (Need to arrange first)',
    fee: 0,
  ),
];

const List<ColorSwatchRule> _colorSwatchRules = <ColorSwatchRule>[
  ColorSwatchRule(match: <String>['white'], value: Color(0xFFF8FAFC)),
  ColorSwatchRule(match: <String>['black'], value: Color(0xFF171717)),
  ColorSwatchRule(match: <String>['navy'], value: Color(0xFF243B6B)),
  ColorSwatchRule(match: <String>['royal blue'], value: Color(0xFF1D4ED8)),
  ColorSwatchRule(match: <String>['aqua'], value: Color(0xFF4CC9F0)),
  ColorSwatchRule(match: <String>['sky blue'], value: Color(0xFF38BDF8)),
  ColorSwatchRule(match: <String>['blue'], value: Color(0xFF2563EB)),
  ColorSwatchRule(match: <String>['purple'], value: Color(0xFF7C3AED)),
  ColorSwatchRule(match: <String>['light pink'], value: Color(0xFFF9A8D4)),
  ColorSwatchRule(match: <String>['vibrant pink'], value: Color(0xFFEC4899)),
  ColorSwatchRule(match: <String>['pink'], value: Color(0xFFDB2777)),
  ColorSwatchRule(match: <String>['deep red'], value: Color(0xFF991B1B)),
  ColorSwatchRule(match: <String>['red'], value: Color(0xFFC0392B)),
  ColorSwatchRule(match: <String>['military green'], value: Color(0xFF556B2F)),
  ColorSwatchRule(match: <String>['bottle green'], value: Color(0xFF14532D)),
  ColorSwatchRule(match: <String>['vibrant apple green'], value: Color(0xFFA3E635)),
  ColorSwatchRule(match: <String>['vibrant green'], value: Color(0xFF22C55E)),
  ColorSwatchRule(match: <String>['tea green'], value: Color(0xFFD9F99D)),
  ColorSwatchRule(match: <String>['pastel green'], value: Color(0xFFD9F99D)),
  ColorSwatchRule(match: <String>['green'], value: Color(0xFF2F855A)),
  ColorSwatchRule(match: <String>['deep grey', 'deep gray'], value: Color(0xFF4B5563)),
  ColorSwatchRule(match: <String>['charcoal'], value: Color(0xFF374151)),
  ColorSwatchRule(match: <String>['grey', 'gray'], value: Color(0xFF9CA3AF)),
  ColorSwatchRule(match: <String>['soft pastel yellow'], value: Color(0xFFFDE68A)),
  ColorSwatchRule(match: <String>['lemon yellow'], value: Color(0xFFFACC15)),
  ColorSwatchRule(match: <String>['serein yellow'], value: Color(0xFFF4D35E)),
  ColorSwatchRule(match: <String>['moutard yellow', 'mustard yellow'], value: Color(0xFFD4A017)),
  ColorSwatchRule(match: <String>['yellow'], value: Color(0xFFEAB308)),
  ColorSwatchRule(match: <String>['orange'], value: Color(0xFFEA580C)),
  ColorSwatchRule(match: <String>['gold'], value: Color(0xFFC68A12)),
  ColorSwatchRule(match: <String>['beige'], value: Color(0xFFD6C3A1)),
  ColorSwatchRule(match: <String>['cream'], value: Color(0xFFF1E7D0)),
  ColorSwatchRule(match: <String>['brown'], value: Color(0xFF7C4A2D)),
];

void main() {
  runApp(const MoTshirtApp());
}

class MoTshirtApp extends StatelessWidget {
  const MoTshirtApp({super.key, MoRepository? repository})
      : repository = repository ?? const NetworkMoRepository();

  final MoRepository repository;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MO T-SHIRT',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: _brandCream,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _brandOrange,
          primary: _brandOrange,
          secondary: const Color(0xFF161616),
          surface: Colors.white,
        ),
        textTheme: ThemeData.light().textTheme.apply(
              bodyColor: _brandInk,
              displayColor: _brandInk,
            ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: const BorderSide(color: _brandOrange, width: 1.4),
          ),
        ),
      ),
      home: HomeShell(repository: repository),
    );
  }
}

abstract class MoRepository {
  Future<AppBootstrapData> loadBootstrapData();

  Future<QuoteSubmissionResult> submitQuote(QuoteSubmissionPayload payload);
}

class NetworkMoRepository implements MoRepository {
  const NetworkMoRepository();

  @override
  Future<AppBootstrapData> loadBootstrapData() async {
    final responses = await Future.wait<dynamic>(<Future<dynamic>>[
      _getJson(_shopApiUrl),
      _getJson(_quoteOptionsApiUrl),
    ]);

    final List<dynamic> itemsJson =
        (responses[0] as Map<String, dynamic>)['items'] as List<dynamic>? ??
            <dynamic>[];
    final Map<String, dynamic> quoteJson =
        responses[1] as Map<String, dynamic>;

    return AppBootstrapData(
      shopItems: itemsJson
          .whereType<Map<String, dynamic>>()
          .map(ShopItem.fromJson)
          .toList(growable: false),
      quoteOptions: QuoteOptions.fromJson(quoteJson),
    );
  }

  @override
  Future<QuoteSubmissionResult> submitQuote(
    QuoteSubmissionPayload payload,
  ) async {
    if (payload.logoFile != null) {
      return _submitMultipartQuote(payload);
    }
    return _submitJsonQuote(payload);
  }

  Future<Map<String, dynamic>> _getJson(String url) async {
    final http.Response response = await http.get(
      Uri.parse(url),
      headers: const <String, String>{'Accept': 'application/json'},
    );
    final Map<String, dynamic> body = _decodeJsonMap(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        (body['error'] ?? body['message'] ?? 'Request failed.').toString(),
      );
    }
    return body;
  }

  Future<QuoteSubmissionResult> _submitJsonQuote(
    QuoteSubmissionPayload payload,
  ) async {
    final http.Response response = await http.post(
      Uri.parse(_contactApiUrl),
      headers: <String, String>{
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode(payload.toJson()),
    );

    final Map<String, dynamic> body = _decodeJsonMap(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        (body['error'] ?? body['message'] ?? 'Failed to send request.')
            .toString(),
      );
    }

    return QuoteSubmissionResult(
      message:
          (body['message'] ?? 'Thanks! We received your message.').toString(),
      quoteId: body['quoteId']?.toString(),
    );
  }

  Future<QuoteSubmissionResult> _submitMultipartQuote(
    QuoteSubmissionPayload payload,
  ) async {
    final http.MultipartRequest request =
        http.MultipartRequest('POST', Uri.parse(_contactApiUrl));
    request.headers['Accept'] = 'application/json';
    request.fields.addAll(payload.toFormFields());

    final QuoteAttachmentFile file = payload.logoFile!;
    request.files.add(
      http.MultipartFile.fromBytes(
        'files',
        file.bytes,
        filename: file.fileName,
      ),
    );

    final http.StreamedResponse streamedResponse = await request.send();
    final http.Response response =
        await http.Response.fromStream(streamedResponse);
    final Map<String, dynamic> body = _decodeJsonMap(response.body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        (body['error'] ?? body['message'] ?? 'Failed to send request.')
            .toString(),
      );
    }

    return QuoteSubmissionResult(
      message:
          (body['message'] ?? 'Thanks! We received your message.').toString(),
      quoteId: body['quoteId']?.toString(),
    );
  }
}

Map<String, dynamic> _decodeJsonMap(String body) {
  final dynamic decoded = jsonDecode(body);
  if (decoded is Map<String, dynamic>) {
    return decoded;
  }
  throw const FormatException('Invalid JSON response.');
}

class AppBootstrapData {
  const AppBootstrapData({
    required this.shopItems,
    required this.quoteOptions,
  });

  final List<ShopItem> shopItems;
  final QuoteOptions quoteOptions;
}

class QuoteSubmissionResult {
  const QuoteSubmissionResult({
    required this.message,
    required this.quoteId,
  });

  final String message;
  final String? quoteId;
}

class QuoteSubmissionPayload {
  const QuoteSubmissionPayload({
    required this.name,
    required this.email,
    required this.phone,
    required this.printMethod,
    required this.deadline,
    required this.notes,
    required this.deliveryMethod,
    required this.deliveryName,
    required this.deliveryAddress,
    required this.deliveryPostCode,
    required this.deliveryPhone,
    required this.garments,
    required this.logoFile,
  });

  final String name;
  final String email;
  final String phone;
  final String printMethod;
  final String deadline;
  final String notes;
  final String deliveryMethod;
  final String deliveryName;
  final String deliveryAddress;
  final String deliveryPostCode;
  final String deliveryPhone;
  final List<QuoteGarmentDraft> garments;
  final QuoteAttachmentFile? logoFile;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'name': name.trim(),
      'email': email.trim(),
      'phone': phone.trim(),
      'message': _buildMessage(),
      'notes': notes.trim(),
      'printMethod': printMethod.trim(),
      'deadline': deadline.trim(),
      'delivery': deliveryMethod,
      'deliveryName': deliveryName.trim(),
      'deliveryAddress': deliveryAddress.trim(),
      'deliveryPostCode': deliveryPostCode.trim(),
      'deliveryPhone': deliveryPhone.trim(),
      'source': 'MO T-SHIRT Mobile App',
      'garments': garments.map((QuoteGarmentDraft line) => line.toJson()).toList(),
      if (logoFile != null)
        'attachments': <Map<String, dynamic>>[
          logoFile!.toAttachmentJson(),
        ],
    };
  }

  Map<String, String> toFormFields() {
    return <String, String>{
      'name': name.trim(),
      'email': email.trim(),
      'phone': phone.trim(),
      'message': _buildMessage(),
      'notes': notes.trim(),
      'printMethod': printMethod.trim(),
      'deadline': deadline.trim(),
      'delivery': deliveryMethod,
      'deliveryName': deliveryName.trim(),
      'deliveryAddress': deliveryAddress.trim(),
      'deliveryPostCode': deliveryPostCode.trim(),
      'deliveryPhone': deliveryPhone.trim(),
      'source': 'MO T-SHIRT Mobile App',
      'garments':
          jsonEncode(garments.map((QuoteGarmentDraft line) => line.toJson()).toList()),
      if (logoFile != null)
        'attachments': jsonEncode(<Map<String, dynamic>>[
          logoFile!.toAttachmentJson(),
        ]),
      if (logoFile != null) 'attachmentName': logoFile!.fileName,
      if (logoFile != null && logoFile!.contentType != null)
        'attachmentType': logoFile!.contentType!,
      if (logoFile != null) 'attachmentSize': logoFile!.bytes.length.toString(),
    };
  }

  String _buildMessage() {
    final StringBuffer buffer = StringBuffer(
      'Mobile app quote request from ${name.trim().isEmpty ? 'customer' : name.trim()}.\n',
    );
    if (garments.isNotEmpty) {
      buffer.writeln('Garments:');
      for (final QuoteGarmentDraft garment in garments) {
        buffer.writeln('- ${garment.summary}');
      }
    }
    if (printMethod.trim().isNotEmpty) {
      buffer.writeln('Print method: ${printMethod.trim()}');
    }
    if (deadline.trim().isNotEmpty) {
      buffer.writeln('Deadline: ${deadline.trim()}');
    }
    if (deliveryMethod.trim().isNotEmpty) {
      buffer.writeln('Delivery: ${deliveryMethod.trim()}');
    }
    if (notes.trim().isNotEmpty) {
      buffer.writeln('Notes: ${notes.trim()}');
    }
    if (logoFile != null) {
      buffer.writeln('Artwork: ${logoFile!.fileName}');
    }
    return buffer.toString().trim();
  }
}

class QuoteAttachmentFile {
  const QuoteAttachmentFile({
    required this.fileName,
    required this.bytes,
    required this.contentType,
  });

  final String fileName;
  final Uint8List bytes;
  final String? contentType;

  Map<String, dynamic> toAttachmentJson() {
    return <String, dynamic>{
      'label': 'Logo / artwork',
      'filename': fileName,
      if (contentType != null) 'contentType': contentType,
      'size': bytes.length,
    };
  }
}

class ShopSizePrice {
  const ShopSizePrice({
    required this.size,
    required this.price,
  });

  factory ShopSizePrice.fromJson(Map<String, dynamic> json) {
    return ShopSizePrice(
      size: _normalizeSizeLabel(json['size']?.toString() ?? ''),
      price: _toDouble(json['price']),
    );
  }

  final String size;
  final double price;
}

class ShopItem {
  const ShopItem({
    required this.id,
    required this.title,
    required this.colors,
    required this.sizePrices,
    required this.pickupPoint,
    required this.collectionPoint,
    required this.photoUrl,
    required this.inStock,
  });

  factory ShopItem.fromJson(Map<String, dynamic> json) {
    final List<String> colors = (json['colors'] as List<dynamic>? ?? <dynamic>[])
        .map((dynamic item) => item.toString().trim())
        .where((String item) => item.isNotEmpty)
        .toList(growable: false);
    final List<ShopSizePrice> sizePrices =
        (json['sizePrices'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(ShopSizePrice.fromJson)
            .where((ShopSizePrice item) => item.size.isNotEmpty)
            .toList(growable: false);

    return ShopItem(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      colors: colors.isEmpty ? const <String>['Default'] : colors,
      sizePrices: sizePrices.isEmpty
          ? const <ShopSizePrice>[ShopSizePrice(size: 'One size', price: 0)]
          : sizePrices,
      pickupPoint: json['pickupPoint']?.toString() ?? 'Nouvelle France',
      collectionPoint: json['collectionPoint']?.toString() ?? 'Surinam',
      photoUrl: _normalizeRemoteUrl(json['photoUrl']?.toString()),
      inStock: json['inStock'] != false,
    );
  }

  final String id;
  final String title;
  final List<String> colors;
  final List<ShopSizePrice> sizePrices;
  final String pickupPoint;
  final String collectionPoint;
  final String? photoUrl;
  final bool inStock;

  List<String> get sizes =>
      sizePrices.map((ShopSizePrice item) => item.size).toList(growable: false);

  bool get isOneSize =>
      sizePrices.length == 1 && _isOneSizeLabel(sizePrices.first.size);

  double priceForSize(String size) {
    for (final ShopSizePrice entry in sizePrices) {
      if (entry.size == size) {
        return entry.price;
      }
    }
    return sizePrices.isEmpty ? 0 : sizePrices.first.price;
  }

  double get minPrice {
    if (sizePrices.isEmpty) {
      return 0;
    }
    return sizePrices
        .map((ShopSizePrice item) => item.price)
        .reduce((double a, double b) => a < b ? a : b);
  }
}

class QuoteOptions {
  const QuoteOptions({
    required this.colors,
    required this.colorsByGarment,
  });

  factory QuoteOptions.empty() {
    return const QuoteOptions(
      colors: <String>[],
      colorsByGarment: <String, List<String>>{},
    );
  }

  factory QuoteOptions.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> rawColorsByGarment =
        json['colorsByGarment'] as Map<String, dynamic>? ??
            <String, dynamic>{};
    final Map<String, List<String>> colorsByGarment = <String, List<String>>{};

    rawColorsByGarment.forEach((String key, dynamic value) {
      colorsByGarment[key] = (value as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => item.toString().trim())
          .where((String item) => item.isNotEmpty)
          .toList(growable: false);
    });

    return QuoteOptions(
      colors: (json['colors'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => item.toString().trim())
          .where((String item) => item.isNotEmpty)
          .toList(growable: false),
      colorsByGarment: colorsByGarment,
    );
  }

  final List<String> colors;
  final Map<String, List<String>> colorsByGarment;

  List<String> colorsForGarment(String garment) {
    final List<String> garmentColors = colorsByGarment[garment] ?? <String>[];
    if (garmentColors.isNotEmpty) {
      return garmentColors;
    }
    return colors;
  }
}

class CartLine {
  const CartLine({
    required this.itemId,
    required this.title,
    required this.color,
    required this.size,
    required this.quantity,
    required this.unitPrice,
    required this.photoUrl,
  });

  final String itemId;
  final String title;
  final String color;
  final String size;
  final int quantity;
  final double unitPrice;
  final String? photoUrl;

  double get lineTotal => unitPrice * quantity;

  CartLine copyWith({
    String? itemId,
    String? title,
    String? color,
    String? size,
    int? quantity,
    double? unitPrice,
    String? photoUrl,
  }) {
    return CartLine(
      itemId: itemId ?? this.itemId,
      title: title ?? this.title,
      color: color ?? this.color,
      size: size ?? this.size,
      quantity: quantity ?? this.quantity,
      unitPrice: unitPrice ?? this.unitPrice,
      photoUrl: photoUrl ?? this.photoUrl,
    );
  }
}

class DeliveryInfo {
  const DeliveryInfo({
    this.name = '',
    this.address = '',
    this.postCode = '',
    this.phone = '',
  });

  final String name;
  final String address;
  final String postCode;
  final String phone;

  DeliveryInfo copyWith({
    String? name,
    String? address,
    String? postCode,
    String? phone,
  }) {
    return DeliveryInfo(
      name: name ?? this.name,
      address: address ?? this.address,
      postCode: postCode ?? this.postCode,
      phone: phone ?? this.phone,
    );
  }
}

class QuoteGarmentDraft {
  const QuoteGarmentDraft({
    required this.garment,
    required this.color,
    required this.size,
    required this.quantity,
  });

  final String garment;
  final String color;
  final String size;
  final String quantity;

  QuoteGarmentDraft copyWith({
    String? garment,
    String? color,
    String? size,
    String? quantity,
  }) {
    return QuoteGarmentDraft(
      garment: garment ?? this.garment,
      color: color ?? this.color,
      size: size ?? this.size,
      quantity: quantity ?? this.quantity,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'garment': garment.trim(),
      'color': color.trim(),
      'size': size.trim(),
      'quantity': quantity.trim(),
    };
  }

  String get summary {
    final List<String> parts = <String>[
      garment.trim().isEmpty ? 'Custom item' : garment.trim(),
      if (color.trim().isNotEmpty) color.trim(),
      if (size.trim().isNotEmpty &&
          !_isOneSizeLabel(_normalizeSizeLabel(size.trim())))
        _normalizeSizeLabel(size.trim()),
      if (quantity.trim().isNotEmpty) 'Qty ${quantity.trim()}',
    ];
    return parts.join(' • ');
  }
}

class DeliveryMethod {
  const DeliveryMethod({
    required this.value,
    required this.label,
    required this.fee,
  });

  final String value;
  final String label;
  final double fee;
}

class ColorSwatchRule {
  const ColorSwatchRule({
    required this.match,
    required this.value,
  });

  final List<String> match;
  final Color value;
}

enum RootTab {
  home,
  catalog,
  quote,
  contact,
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.repository});

  final MoRepository repository;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  RootTab _currentTab = RootTab.home;
  bool _loading = true;
  bool _refreshing = false;
  String? _loadError;
  List<ShopItem> _shopItems = <ShopItem>[];
  QuoteOptions _quoteOptions = QuoteOptions.empty();
  List<CartLine> _cartLines = <CartLine>[];
  DeliveryMethod _deliveryMethod = _deliveryMethods.first;
  DeliveryInfo _deliveryInfo = const DeliveryInfo();

  @override
  void initState() {
    super.initState();
    _loadBootstrapData();
  }

  Future<void> _loadBootstrapData({bool silent = false}) async {
    if (silent) {
      setState(() {
        _refreshing = true;
      });
    } else {
      setState(() {
        _loading = true;
      });
    }

    try {
      final AppBootstrapData data = await widget.repository.loadBootstrapData();
      if (!mounted) {
        return;
      }
      setState(() {
        _shopItems = data.shopItems;
        _quoteOptions = data.quoteOptions;
        _loadError = null;
        _loading = false;
        _refreshing = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loadError = error is Exception ? error.toString().replaceFirst('Exception: ', '') : 'Failed to load app.';
        _loading = false;
        _refreshing = false;
      });
    }
  }

  int get _cartItemCount => _cartLines.fold<int>(
        0,
        (int total, CartLine line) => total + line.quantity,
      );

  double get _cartSubtotal => _cartLines.fold<double>(
        0,
        (double total, CartLine line) => total + line.lineTotal,
      );

  bool get _deliveryInfoRequired =>
      _deliveryMethod.value != 'Surinam pickup';

  double get _deliveryFee =>
      _deliveryInfoRequired ? _deliveryMethod.fee : 0;

  double get _cartTotal => _cartSubtotal + _deliveryFee;

  String get _tabTitle {
    switch (_currentTab) {
      case RootTab.home:
        return 'MO T-SHIRT';
      case RootTab.catalog:
        return 'Catalogue';
      case RootTab.quote:
        return 'Quote';
      case RootTab.contact:
        return 'Contact';
    }
  }

  void _selectTab(RootTab tab) {
    setState(() {
      _currentTab = tab;
    });
  }

  void _addToCart(ShopItem item, String color, String size, int quantity) {
    setState(() {
      final int existingIndex = _cartLines.indexWhere(
        (CartLine line) =>
            line.itemId == item.id &&
            line.color == color &&
            line.size == size,
      );

      if (existingIndex >= 0) {
        final CartLine current = _cartLines[existingIndex];
        _cartLines[existingIndex] = current.copyWith(
          quantity: current.quantity + quantity,
          unitPrice: item.priceForSize(size),
          photoUrl: item.photoUrl,
        );
      } else {
        _cartLines = <CartLine>[
          ..._cartLines,
          CartLine(
            itemId: item.id,
            title: item.title,
            color: color,
            size: size,
            quantity: quantity,
            unitPrice: item.priceForSize(size),
            photoUrl: item.photoUrl,
          ),
        ];
      }
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$quantity x ${item.title} added to your order.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _updateCartQuantity(int index, int quantity) {
    if (quantity < 1 || index < 0 || index >= _cartLines.length) {
      return;
    }
    setState(() {
      _cartLines[index] = _cartLines[index].copyWith(quantity: quantity);
    });
  }

  void _removeCartLine(int index) {
    if (index < 0 || index >= _cartLines.length) {
      return;
    }
    setState(() {
      _cartLines = <CartLine>[
        ..._cartLines.sublist(0, index),
        ..._cartLines.sublist(index + 1),
      ];
    });
  }

  void _clearCart() {
    setState(() {
      _cartLines = <CartLine>[];
      _deliveryMethod = _deliveryMethods.first;
      _deliveryInfo = const DeliveryInfo();
    });
  }

  Future<void> _openProductDetails(ShopItem item) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (BuildContext context) => ProductDetailPage(
          item: item,
          onAddToCart: _addToCart,
        ),
      ),
    );
  }

  Future<void> _openCartSheet() async {
    if (_cartLines.isEmpty) {
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (BuildContext context) {
        return OrderCartSheet(
          lines: _cartLines,
          deliveryMethod: _deliveryMethod,
          deliveryInfo: _deliveryInfo,
          subtotal: _cartSubtotal,
          deliveryFee: _deliveryFee,
          total: _cartTotal,
          onClose: () => Navigator.of(context).pop(),
          onDeliveryMethodChanged: (DeliveryMethod value) {
            setState(() {
              _deliveryMethod = value;
            });
          },
          onDeliveryInfoChanged: (DeliveryInfo info) {
            setState(() {
              _deliveryInfo = info;
            });
          },
          onUpdateQuantity: _updateCartQuantity,
          onRemoveLine: _removeCartLine,
          onClear: _clearCart,
          onRequestQuote: () {
            Navigator.of(context).pop();
            _selectTab(RootTab.quote);
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool showCartAction = _cartLines.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _brandCream,
        surfaceTintColor: Colors.transparent,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              _tabTitle,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            if (_refreshing)
              const Text(
                'Refreshing live data…',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
          ],
        ),
        actions: <Widget>[
          if (showCartAction)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: IconButton(
                onPressed: _openCartSheet,
                icon: Badge(
                  label: Text(_cartItemCount.toString()),
                  child: const Icon(Icons.shopping_bag_rounded),
                ),
                tooltip: 'Order list',
              ),
            ),
        ],
      ),
      body: _buildBody(),
      floatingActionButton: _cartLines.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _openCartSheet,
              backgroundColor: _brandInk,
              foregroundColor: Colors.white,
              icon: Badge(
                label: Text(_cartItemCount.toString()),
                child: const Icon(Icons.shopping_bag_rounded),
              ),
              label: Text(formatMoney(_cartTotal, whole: true)),
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: RootTab.values.indexOf(_currentTab),
        onDestinationSelected: (int index) => _selectTab(RootTab.values[index]),
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.shopping_bag_rounded),
            label: 'Catalogue',
          ),
          NavigationDestination(
            icon: Icon(Icons.request_quote_rounded),
            label: 'Quote',
          ),
          NavigationDestination(
            icon: Icon(Icons.support_agent_rounded),
            label: 'Contact',
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _shopItems.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: _brandOrange),
      );
    }

    if (_loadError != null && _shopItems.isEmpty) {
      return _FailureState(
        message: _loadError!,
        onRetry: _loadBootstrapData,
      );
    }

    return IndexedStack(
      index: RootTab.values.indexOf(_currentTab),
      children: <Widget>[
        HomeScreen(
          items: _shopItems,
          errorMessage: _loadError,
          onRefresh: () => _loadBootstrapData(silent: true),
          onBrowseCatalogue: () => _selectTab(RootTab.catalog),
          onOpenProduct: _openProductDetails,
          onOpenQuote: () => _selectTab(RootTab.quote),
          onOpenCart: _cartLines.isEmpty ? null : _openCartSheet,
          onLaunchWhatsApp: () => launchExternalUri(_whatsAppUri),
        ),
        CatalogScreen(
          items: _shopItems,
          errorMessage: _loadError,
          onRefresh: () => _loadBootstrapData(silent: true),
          onOpenProduct: _openProductDetails,
        ),
        QuoteScreen(
          repository: widget.repository,
          quoteOptions: _quoteOptions,
          cartLines: _cartLines,
          selectedDeliveryMethod: _deliveryMethod.value,
          selectedDeliveryInfo: _deliveryInfo,
        ),
        ContactScreen(
          onOpenWebsite: () => launchExternalUri(_websiteUri),
          onWhatsApp: () => launchExternalUri(_whatsAppUri),
          onCall: () => launchExternalUri(_phoneUri),
          onEmail: () => launchExternalUri(_emailUri),
        ),
      ],
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.items,
    required this.errorMessage,
    required this.onRefresh,
    required this.onBrowseCatalogue,
    required this.onOpenProduct,
    required this.onOpenQuote,
    required this.onOpenCart,
    required this.onLaunchWhatsApp,
  });

  final List<ShopItem> items;
  final String? errorMessage;
  final Future<void> Function() onRefresh;
  final VoidCallback onBrowseCatalogue;
  final ValueChanged<ShopItem> onOpenProduct;
  final VoidCallback onOpenQuote;
  final VoidCallback? onOpenCart;
  final VoidCallback onLaunchWhatsApp;

  @override
  Widget build(BuildContext context) {
    final List<ShopItem> featured = items.take(6).toList(growable: false);
    final int colorCount = items
        .expand((ShopItem item) => item.colors)
        .map((String color) => color.toLowerCase().trim())
        .toSet()
        .length;

    return RefreshIndicator(
      color: _brandOrange,
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(28),
              gradient: const LinearGradient(
                colors: <Color>[Color(0xFFFFF1E5), Colors.white],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: const Color(0xFFFFDFC7)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'Real mobile ordering for MO T-SHIRT',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Mauritius printing, without the website detour.',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        height: 1.05,
                      ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Browse live catalogue items, build an order, and send a proper quote request from the app.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.black54,
                        height: 1.45,
                      ),
                ),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: <Widget>[
                    FilledButton.icon(
                      onPressed: onBrowseCatalogue,
                      icon: const Icon(Icons.shopping_bag_rounded),
                      label: const Text('Browse catalogue'),
                    ),
                    OutlinedButton.icon(
                      onPressed: onOpenQuote,
                      icon: const Icon(Icons.request_quote_rounded),
                      label: const Text('Request quote'),
                    ),
                    OutlinedButton.icon(
                      onPressed: onLaunchWhatsApp,
                      icon: const Icon(Icons.chat_rounded),
                      label: const Text('WhatsApp'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (errorMessage != null) ...<Widget>[
            const SizedBox(height: 16),
            _InlineError(message: errorMessage!),
          ],
          const SizedBox(height: 22),
          Row(
            children: <Widget>[
              Expanded(
                child: _StatCard(
                  label: 'Active products',
                  value: items.length.toString(),
                  helper: 'Live from your website catalog',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  label: 'Colours',
                  value: colorCount.toString(),
                  helper: 'Shared with the quote form',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: _StatCard(
                  label: 'Pickup',
                  value: 'Surinam',
                  helper: 'Main collection point',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  label: 'Fast support',
                  value: '+230 5988 3880',
                  helper: 'Call or WhatsApp',
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          _SectionHeading(
            title: 'Featured products',
            subtitle: 'Open any item to choose colour, size, and quantity.',
            trailing: TextButton(
              onPressed: onBrowseCatalogue,
              child: const Text('See all'),
            ),
          ),
          const SizedBox(height: 12),
          if (featured.isEmpty)
            const _EmptyCard(
              text: 'No products are live yet. Pull to refresh after you publish items.',
            )
          else
            SizedBox(
              height: 298,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: featured.length,
                separatorBuilder: (BuildContext context, int index) =>
                    const SizedBox(width: 14),
                itemBuilder: (BuildContext context, int index) {
                  final ShopItem item = featured[index];
                  return SizedBox(
                    width: 236,
                    child: _FeaturedProductCard(
                      item: item,
                      onTap: () => onOpenProduct(item),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 28),
          _SectionHeading(
            title: 'Best next step',
            subtitle: 'Use the catalogue for plain garments and the quote tab for custom work.',
          ),
          const SizedBox(height: 12),
          _ActionPanel(
            icon: Icons.shopping_cart_checkout_rounded,
            title: 'Build a plain garment order',
            subtitle:
                'Choose ready products, colours, sizes, and quantities. Send the order on WhatsApp with delivery details.',
            actionLabel: 'Open order flow',
            onTap: onOpenCart ?? onBrowseCatalogue,
          ),
          const SizedBox(height: 12),
          _ActionPanel(
            icon: Icons.design_services_rounded,
            title: 'Request a custom print quote',
            subtitle:
                'Submit garments, colours, quantities, deadline, and notes directly to your existing backend.',
            actionLabel: 'Open quote form',
            onTap: onOpenQuote,
          ),
        ],
      ),
    );
  }
}

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({
    super.key,
    required this.items,
    required this.errorMessage,
    required this.onRefresh,
    required this.onOpenProduct,
  });

  final List<ShopItem> items;
  final String? errorMessage;
  final Future<void> Function() onRefresh;
  final ValueChanged<ShopItem> onOpenProduct;

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _search = '';
  String _selectedColor = 'all';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final List<String> colors = widget.items
        .expand((ShopItem item) => item.colors)
        .map((String color) => color.trim())
        .where((String color) => color.isNotEmpty)
        .toSet()
        .toList()
      ..sort((String a, String b) => a.compareTo(b));

    final List<ShopItem> filtered = widget.items.where((ShopItem item) {
      final String query = _search.trim().toLowerCase();
      final bool matchesSearch = query.isEmpty ||
          item.title.toLowerCase().contains(query) ||
          item.colors.any((String color) => color.toLowerCase().contains(query));
      final bool matchesColor = _selectedColor == 'all' ||
          item.colors.any((String color) => color == _selectedColor);
      return matchesSearch && matchesColor;
    }).toList(growable: false);

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
          child: Column(
            children: <Widget>[
              TextField(
                controller: _searchController,
                onChanged: (String value) {
                  setState(() {
                    _search = value;
                  });
                },
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
                decoration: InputDecoration(
                  hintText: 'Search products or colours',
                  hintStyle: const TextStyle(fontSize: 14),
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  prefixIcon: const Icon(Icons.search_rounded, size: 20),
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () {
                            _searchController.clear();
                            setState(() {
                              _search = '';
                            });
                          },
                          icon: const Icon(Icons.close_rounded),
                        ),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: <Widget>[
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: const Text(
                          'All colours',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        labelPadding:
                            const EdgeInsets.symmetric(horizontal: 2),
                        visualDensity: VisualDensity.compact,
                        materialTapTargetSize:
                            MaterialTapTargetSize.shrinkWrap,
                        selected: _selectedColor == 'all',
                        onSelected: (_) {
                          setState(() {
                            _selectedColor = 'all';
                          });
                        },
                      ),
                    ),
                    ...colors.map(
                      (String color) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: FilterChip(
                          labelStyle: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                          labelPadding:
                              const EdgeInsets.symmetric(horizontal: 2),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          selected: _selectedColor == color,
                          onSelected: (_) {
                            setState(() {
                              _selectedColor =
                                  _selectedColor == color ? 'all' : color;
                            });
                          },
                          avatar: CircleAvatar(
                            radius: 7,
                            backgroundColor: getColorSwatch(color),
                          ),
                          label: Text(color),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.errorMessage != null)
                _InlineError(message: widget.errorMessage!),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: _brandOrange,
            onRefresh: widget.onRefresh,
            child: filtered.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                    children: const <Widget>[
                      _EmptyCard(
                        text:
                            'No products match those filters. Clear search or colour filters and try again.',
                      ),
                    ],
                  )
                : LayoutBuilder(
                    builder: (
                      BuildContext context,
                      BoxConstraints constraints,
                    ) {
                      final double width = constraints.maxWidth;
                      final int crossAxisCount = width > 980
                          ? 3
                          : width > 620
                              ? 2
                              : 1;
                      return GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
                        gridDelegate:
                            SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: crossAxisCount == 1 ? 0.92 : 0.8,
                        ),
                        itemCount: filtered.length,
                        itemBuilder: (BuildContext context, int index) {
                          return ProductCard(
                            item: filtered[index],
                            onTap: () => widget.onOpenProduct(filtered[index]),
                          );
                        },
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}

class ProductDetailPage extends StatefulWidget {
  const ProductDetailPage({
    super.key,
    required this.item,
    required this.onAddToCart,
  });

  final ShopItem item;
  final void Function(ShopItem item, String color, String size, int quantity)
      onAddToCart;

  @override
  State<ProductDetailPage> createState() => _ProductDetailPageState();
}

class _ProductDetailPageState extends State<ProductDetailPage> {
  late String _selectedColor;
  late String _selectedSize;
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    _selectedColor = widget.item.colors.first;
    _selectedSize = widget.item.sizes.first;
  }

  @override
  Widget build(BuildContext context) {
    final ShopItem item = widget.item;

    return Scaffold(
      backgroundColor: _brandCream,
      appBar: AppBar(
        backgroundColor: _brandCream,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: <Widget>[
          ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: AspectRatio(
              aspectRatio: 1,
              child: _ProductImage(
                imageUrl: item.photoUrl,
                title: item.title,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  item.title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
              ),
              if (!item.inStock)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: _brandInk,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'Out of stock',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            item.isOneSize
                ? formatMoney(item.minPrice, whole: true)
                : 'From ${formatMoney(item.minPrice, whole: true)}',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: _brandOrange,
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 16),
          _InfoStrip(
            icon: Icons.location_on_rounded,
            label: 'Pickup',
            value: item.collectionPoint,
          ),
          const SizedBox(height: 10),
          _InfoStrip(
            icon: Icons.inventory_2_rounded,
            label: 'Supplier pickup',
            value: item.pickupPoint,
          ),
          const SizedBox(height: 22),
          Text(
            'Colour',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: item.colors.map((String color) {
              return ChoiceChip(
                selected: _selectedColor == color,
                onSelected: (_) {
                  setState(() {
                    _selectedColor = color;
                  });
                },
                avatar: CircleAvatar(
                  radius: 10,
                  backgroundColor: getColorSwatch(color),
                ),
                label: Text(color),
              );
            }).toList(growable: false),
          ),
          const SizedBox(height: 22),
          Text(
            'Size',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: item.sizes.map((String size) {
              final double price = item.priceForSize(size);
              return ChoiceChip(
                selected: _selectedSize == size,
                onSelected: (_) {
                  setState(() {
                    _selectedSize = size;
                  });
                },
                label: Text(
                  _isOneSizeLabel(size)
                      ? 'One size • ${formatMoney(price, whole: true)}'
                      : '${_normalizeSizeLabel(size)} • ${formatMoney(price, whole: true)}',
                ),
              );
            }).toList(growable: false),
          ),
          const SizedBox(height: 22),
          Row(
            children: <Widget>[
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                    color: Colors.white,
                  ),
                  child: Row(
                    children: <Widget>[
                      IconButton(
                        onPressed: _quantity > 1
                            ? () {
                                setState(() {
                                  _quantity -= 1;
                                });
                              }
                            : null,
                        icon: const Icon(Icons.remove_rounded),
                      ),
                      Expanded(
                        child: Text(
                          _quantity.toString(),
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          setState(() {
                            _quantity += 1;
                          });
                        },
                        icon: const Icon(Icons.add_rounded),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: FilledButton.icon(
                  onPressed: item.inStock
                      ? () {
                          widget.onAddToCart(
                            item,
                            _selectedColor,
                            _selectedSize,
                            _quantity,
                          );
                          Navigator.of(context).pop();
                        }
                      : null,
                  icon: const Icon(Icons.shopping_bag_rounded),
                  label: const Text('Add to order'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Selected total: ${formatMoney(item.priceForSize(_selectedSize) * _quantity, whole: true)}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
        ],
      ),
    );
  }
}

class QuoteScreen extends StatefulWidget {
  const QuoteScreen({
    super.key,
    required this.repository,
    required this.quoteOptions,
    required this.cartLines,
    required this.selectedDeliveryMethod,
    required this.selectedDeliveryInfo,
  });

  final MoRepository repository;
  final QuoteOptions quoteOptions;
  final List<CartLine> cartLines;
  final String selectedDeliveryMethod;
  final DeliveryInfo selectedDeliveryInfo;

  @override
  State<QuoteScreen> createState() => _QuoteScreenState();
}

class _QuoteScreenState extends State<QuoteScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _printMethodController = TextEditingController();
  final TextEditingController _deadlineController = TextEditingController();
  final TextEditingController _notesController = TextEditingController();
  final TextEditingController _deliveryNameController = TextEditingController();
  final TextEditingController _deliveryAddressController =
      TextEditingController();
  final TextEditingController _deliveryPostCodeController =
      TextEditingController();
  final TextEditingController _deliveryPhoneController =
      TextEditingController();

  late String _deliveryMethod;
  late List<QuoteGarmentDraft> _garments;
  QuoteAttachmentFile? _logoFile;
  bool _submitting = false;
  String? _submissionMessage;
  bool _submissionSucceeded = false;

  @override
  void initState() {
    super.initState();
    _deliveryMethod = widget.selectedDeliveryMethod;
    _deliveryNameController.text = widget.selectedDeliveryInfo.name;
    _deliveryAddressController.text = widget.selectedDeliveryInfo.address;
    _deliveryPostCodeController.text = widget.selectedDeliveryInfo.postCode;
    _deliveryPhoneController.text = widget.selectedDeliveryInfo.phone;
    _garments = const <QuoteGarmentDraft>[
      QuoteGarmentDraft(
        garment: 'T-Shirt',
        color: '',
        size: '',
        quantity: '1',
      ),
    ];
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _printMethodController.dispose();
    _deadlineController.dispose();
    _notesController.dispose();
    _deliveryNameController.dispose();
    _deliveryAddressController.dispose();
    _deliveryPostCodeController.dispose();
    _deliveryPhoneController.dispose();
    super.dispose();
  }

  bool get _deliveryInfoRequired => _deliveryMethod != 'Surinam pickup';

  Future<void> _pickLogoFile() async {
    try {
      final FilePickerResult? result = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: true,
        type: FileType.custom,
        allowedExtensions: <String>[
          'png',
          'jpg',
          'jpeg',
          'webp',
          'svg',
          'pdf',
          'heic',
          'heif',
        ],
      );

      if (result == null || result.files.isEmpty) {
        return;
      }

      final PlatformFile file = result.files.single;
      if (file.bytes == null || file.bytes!.isEmpty) {
        setState(() {
          _submissionSucceeded = false;
          _submissionMessage = 'Could not read that logo file. Try another one.';
        });
        return;
      }

      setState(() {
        _logoFile = QuoteAttachmentFile(
          fileName: file.name,
          bytes: file.bytes!,
          contentType: _contentTypeForFileName(file.name),
        );
        _submissionMessage = null;
      });
    } catch (_) {
      setState(() {
        _submissionSucceeded = false;
        _submissionMessage = 'File picker failed. Try again.';
      });
    }
  }

  Future<void> _submit() async {
    final FormState? formState = _formKey.currentState;
    if (formState == null || !formState.validate()) {
      return;
    }

    if (_garments.isEmpty) {
      setState(() {
        _submissionSucceeded = false;
        _submissionMessage = 'Add at least one garment line.';
      });
      return;
    }

    final bool hasEmail = _emailController.text.trim().isNotEmpty;
    final bool hasPhone = _phoneController.text.trim().isNotEmpty;
    if (!hasEmail && !hasPhone) {
      setState(() {
        _submissionSucceeded = false;
        _submissionMessage = 'Provide an email or a phone number.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _submissionMessage = null;
    });

    try {
      final QuoteSubmissionResult result = await widget.repository.submitQuote(
        QuoteSubmissionPayload(
          name: _nameController.text,
          email: _emailController.text,
          phone: _phoneController.text,
          printMethod: _printMethodController.text,
          deadline: _deadlineController.text,
          notes: _notesController.text,
          deliveryMethod: _deliveryMethod,
          deliveryName: _deliveryNameController.text,
          deliveryAddress: _deliveryAddressController.text,
          deliveryPostCode: _deliveryPostCodeController.text,
          deliveryPhone: _deliveryPhoneController.text,
          garments: _garments,
          logoFile: _logoFile,
        ),
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _submissionSucceeded = true;
        _submissionMessage = result.quoteId == null
            ? result.message
            : '${result.message} Reference: ${result.quoteId}';
        _submitting = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _submissionSucceeded = false;
        _submissionMessage = error is Exception
            ? error.toString().replaceFirst('Exception: ', '')
            : 'Failed to send quote request.';
        _submitting = false;
      });
    }
  }

  void _importCart() {
    if (widget.cartLines.isEmpty) {
      return;
    }

    setState(() {
      _garments = widget.cartLines
          .map(
            (CartLine line) => QuoteGarmentDraft(
              garment: line.title,
              color: line.color,
              size: line.size,
              quantity: line.quantity.toString(),
            ),
          )
          .toList(growable: false);
      _deliveryMethod = widget.selectedDeliveryMethod;
      _deliveryNameController.text = widget.selectedDeliveryInfo.name;
      _deliveryAddressController.text = widget.selectedDeliveryInfo.address;
      _deliveryPostCodeController.text = widget.selectedDeliveryInfo.postCode;
      _deliveryPhoneController.text = widget.selectedDeliveryInfo.phone;
      _submissionMessage = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Send a proper quote request',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'This goes straight to the same MO T-SHIRT backend your website already uses.',
                  style: TextStyle(color: Colors.black54, height: 1.45),
                ),
                if (widget.cartLines.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _importCart,
                    icon: const Icon(Icons.shopping_bag_rounded),
                    label: Text(
                      'Import ${widget.cartLines.length} item'
                      '${widget.cartLines.length == 1 ? '' : 's'} from order list',
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            'Logo / artwork',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Optional. Upload the client logo with the quote.',
                            style: TextStyle(
                              color: Colors.black54,
                              fontSize: 13,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: _pickLogoFile,
                      icon: const Icon(Icons.upload_file_rounded),
                      label: Text(_logoFile == null ? 'Upload' : 'Change'),
                    ),
                  ],
                ),
                if (_logoFile != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: <Widget>[
                        const Icon(
                          Icons.verified_rounded,
                          color: _brandOrange,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _logoFile!.fileName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            setState(() {
                              _logoFile = null;
                            });
                          },
                          child: const Text('Remove'),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Your name',
              hintText: 'Ryan',
            ),
            validator: (String? value) {
              if (value == null || value.trim().isEmpty) {
                return 'Name is required.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              hintText: 'you@example.com',
            ),
            validator: (String? value) {
              final String trimmed = (value ?? '').trim();
              if (trimmed.isEmpty) {
                return null;
              }
              final RegExp emailRegExp =
                  RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
              if (!emailRegExp.hasMatch(trimmed)) {
                return 'Enter a valid email.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone',
              hintText: '+230 5988 3880',
            ),
          ),
          const SizedBox(height: 20),
          _SectionHeading(
            title: 'Garments',
            subtitle: 'Add the products you want quoted.',
            trailing: TextButton.icon(
              onPressed: () {
                setState(() {
                  _garments = <QuoteGarmentDraft>[
                    ..._garments,
                    const QuoteGarmentDraft(
                      garment: 'T-Shirt',
                      color: '',
                      size: '',
                      quantity: '1',
                    ),
                  ];
                });
              },
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add line'),
            ),
          ),
          const SizedBox(height: 12),
          ..._buildGarmentCards(context),
          const SizedBox(height: 20),
          TextFormField(
            controller: _printMethodController,
            decoration: const InputDecoration(
              labelText: 'Print method',
              hintText: 'DTF, embroidery, screen print, sublimation...',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _deadlineController,
            decoration: const InputDecoration(
              labelText: 'Deadline',
              hintText: 'Need it by next Friday',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _notesController,
            minLines: 4,
            maxLines: 7,
            decoration: const InputDecoration(
              labelText: 'Notes',
              hintText: 'Logo placement, quantity split, urgent timing, special instructions...',
            ),
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: _deliveryMethod,
            decoration: const InputDecoration(labelText: 'Delivery method'),
            items: _deliveryMethods
                .map(
                  (DeliveryMethod method) => DropdownMenuItem<String>(
                    value: method.value,
                    child: Text(method.label),
                  ),
                )
                .toList(growable: false),
            onChanged: (String? value) {
              if (value == null) {
                return;
              }
              setState(() {
                _deliveryMethod = value;
              });
            },
          ),
          if (_deliveryInfoRequired) ...<Widget>[
            const SizedBox(height: 12),
            TextFormField(
              controller: _deliveryNameController,
              decoration: const InputDecoration(labelText: 'Delivery name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _deliveryAddressController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Delivery address'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _deliveryPostCodeController,
              decoration: const InputDecoration(labelText: 'Post code'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _deliveryPhoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Delivery phone'),
            ),
          ],
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.send_rounded),
            label: Text(_submitting ? 'Sending quote…' : 'Send quote request'),
          ),
          if (_submissionMessage != null) ...<Widget>[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _submissionSucceeded
                    ? const Color(0xFFECFDF3)
                    : const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: _submissionSucceeded
                      ? const Color(0xFFA7F3D0)
                      : const Color(0xFFFECACA),
                ),
              ),
              child: Text(
                _submissionMessage!,
                style: TextStyle(
                  color: _submissionSucceeded
                      ? const Color(0xFF166534)
                      : const Color(0xFFB91C1C),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _buildGarmentCards(BuildContext context) {
    if (_garments.isEmpty) {
      return const <Widget>[
        _EmptyCard(
          text: 'Add at least one garment line before submitting.',
        ),
      ];
    }

    return List<Widget>.generate(_garments.length, (int index) {
      final QuoteGarmentDraft garment = _garments[index];
      final List<String> colors =
          widget.quoteOptions.colorsForGarment(garment.garment);

      return Padding(
        padding: EdgeInsets.only(bottom: index == _garments.length - 1 ? 0 : 12),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      'Line ${index + 1}',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ),
                  if (_garments.length > 1)
                    TextButton(
                      onPressed: () {
                        setState(() {
                          _garments = <QuoteGarmentDraft>[
                            ..._garments.sublist(0, index),
                            ..._garments.sublist(index + 1),
                          ];
                        });
                      },
                      child: const Text('Remove'),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _quoteGarmentOptions.contains(garment.garment)
                    ? garment.garment
                    : _quoteGarmentOptions.first,
                decoration: const InputDecoration(labelText: 'Garment'),
                items: _quoteGarmentOptions
                    .map(
                      (String option) => DropdownMenuItem<String>(
                        value: option,
                        child: Text(option),
                      ),
                    )
                    .toList(growable: false),
                onChanged: (String? value) {
                  if (value == null) {
                    return;
                  }
                  setState(() {
                    _garments[index] = garment.copyWith(
                      garment: value,
                      color: '',
                    );
                  });
                },
              ),
              const SizedBox(height: 12),
              if (colors.isEmpty)
                TextFormField(
                  initialValue: garment.color,
                  decoration: const InputDecoration(
                    labelText: 'Colour',
                    hintText: 'Any / custom colour',
                  ),
                  onChanged: (String value) {
                    _garments[index] = garment.copyWith(color: value);
                  },
                )
              else
                DropdownButtonFormField<String>(
                  initialValue: garment.color.isEmpty ? null : garment.color,
                  decoration: const InputDecoration(labelText: 'Colour'),
                  items: colors
                      .map(
                        (String color) => DropdownMenuItem<String>(
                          value: color,
                          child: Text(color),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (String? value) {
                    setState(() {
                      _garments[index] = garment.copyWith(color: value ?? '');
                    });
                  },
                ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: garment.size,
                decoration: const InputDecoration(
                  labelText: 'Size',
                  hintText: 'M, XL, One size, mixed sizes...',
                ),
                onChanged: (String value) {
                  _garments[index] = garment.copyWith(size: value);
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: garment.quantity,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Quantity',
                  hintText: '50',
                ),
                validator: (String? value) {
                  if ((value ?? '').trim().isEmpty) {
                    return 'Quantity is required.';
                  }
                  return null;
                },
                onChanged: (String value) {
                  _garments[index] = garment.copyWith(quantity: value);
                },
              ),
            ],
          ),
        ),
      );
    });
  }
}

class ContactScreen extends StatelessWidget {
  const ContactScreen({
    super.key,
    required this.onOpenWebsite,
    required this.onWhatsApp,
    required this.onCall,
    required this.onEmail,
  });

  final VoidCallback onOpenWebsite;
  final VoidCallback onWhatsApp;
  final VoidCallback onCall;
  final VoidCallback onEmail;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: <Color>[Color(0xFFFFF1E5), Colors.white],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: const Color(0xFFFFDFC7)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Support and pickup',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Quick contact, pickup info, and useful links.',
                style: TextStyle(color: Colors.black54, height: 1.45),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        _ContactActionCard(
          icon: Icons.chat_rounded,
          title: 'WhatsApp',
          subtitle: 'Fastest for urgent orders',
          cta: 'Open',
          onTap: onWhatsApp,
        ),
        const SizedBox(height: 12),
        _ContactActionCard(
          icon: Icons.call_rounded,
          title: 'Phone',
          subtitle: '+230 5988 3880',
          cta: 'Call',
          onTap: onCall,
        ),
        const SizedBox(height: 12),
        _ContactActionCard(
          icon: Icons.email_rounded,
          title: 'Email',
          subtitle: 'motshirtmauritius@gmail.com',
          cta: 'Email',
          onTap: onEmail,
        ),
        const SizedBox(height: 12),
        _ContactActionCard(
          icon: Icons.language_rounded,
          title: 'Website',
          subtitle: 'Full public site',
          cta: 'Open',
          onTap: onOpenWebsite,
        ),
        const SizedBox(height: 22),
        const _BusinessInfoCard(
          title: 'Pickup / Delivery',
          lines: <String>[
            'Pickup location: Surinam, Mauritius',
            'Supplier pickup point: Nouvelle France',
            'Delivery via Mauritius Post or arranged delivery',
          ],
        ),
        const SizedBox(height: 12),
        const _BusinessInfoCard(
          title: 'Business hours',
          lines: <String>[
            'Monday to Friday',
            '09:00 to 17:00',
          ],
        ),
        const SizedBox(height: 12),
        const _BusinessInfoCard(
          title: 'What the app covers',
          lines: <String>[
            'Live plain-garment catalogue',
            'Native order list for WhatsApp orders',
            'Native quote request form linked to your backend',
          ],
        ),
      ],
    );
  }
}

class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.item,
    required this.onTap,
  });

  final ShopItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final String heroColor = item.colors.first;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(28),
      child: Ink(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: const Color(0xFFE5E7EB)),
          boxShadow: const <BoxShadow>[
            BoxShadow(
              color: Color(0x12000000),
              blurRadius: 18,
              offset: Offset(0, 12),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(28),
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: <Widget>[
                    _ProductImage(
                      imageUrl: item.photoUrl,
                      title: item.title,
                    ),
                    if (!item.inStock)
                      Positioned(
                        right: 14,
                        top: 14,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: _brandInk,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'Out of stock',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _ColorPill(color: heroColor),
                  const SizedBox(height: 10),
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    item.isOneSize
                        ? formatMoney(item.minPrice, whole: true)
                        : 'From ${formatMoney(item.minPrice, whole: true)}',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: _brandOrange,
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: item.sizes
                        .take(4)
                        .map(
                          (String size) => _SmallTag(
                            text: _normalizeSizeLabel(size),
                          ),
                        )
                        .toList(growable: false),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class OrderCartSheet extends StatelessWidget {
  const OrderCartSheet({
    super.key,
    required this.lines,
    required this.deliveryMethod,
    required this.deliveryInfo,
    required this.subtotal,
    required this.deliveryFee,
    required this.total,
    required this.onClose,
    required this.onDeliveryMethodChanged,
    required this.onDeliveryInfoChanged,
    required this.onUpdateQuantity,
    required this.onRemoveLine,
    required this.onClear,
    required this.onRequestQuote,
  });

  final List<CartLine> lines;
  final DeliveryMethod deliveryMethod;
  final DeliveryInfo deliveryInfo;
  final double subtotal;
  final double deliveryFee;
  final double total;
  final VoidCallback onClose;
  final ValueChanged<DeliveryMethod> onDeliveryMethodChanged;
  final ValueChanged<DeliveryInfo> onDeliveryInfoChanged;
  final void Function(int index, int quantity) onUpdateQuantity;
  final ValueChanged<int> onRemoveLine;
  final VoidCallback onClear;
  final VoidCallback onRequestQuote;

  bool get _deliveryInfoRequired => deliveryMethod.value != 'Surinam pickup';

  bool get _canSend {
    if (lines.isEmpty) {
      return false;
    }
    if (!_deliveryInfoRequired) {
      return true;
    }
    return deliveryInfo.name.trim().isNotEmpty &&
        deliveryInfo.address.trim().isNotEmpty &&
        deliveryInfo.phone.trim().isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Center(
                  child: Container(
                    width: 52,
                    height: 5,
                    decoration: BoxDecoration(
                      color: const Color(0xFFD1D5DB),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        'Order list',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                    ),
                    TextButton(
                      onPressed: onClose,
                      child: const Text('Close'),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  lines.isEmpty
                      ? 'Your order list is empty.'
                      : '${lines.length} line item${lines.length == 1 ? '' : 's'} ready to send',
                  style: const TextStyle(color: Colors.black54),
                ),
                const SizedBox(height: 18),
                if (lines.isEmpty)
                  const _EmptyCard(
                    text:
                        'Add catalogue items first, then send the order on WhatsApp from here.',
                  )
                else
                  ...List<Widget>.generate(lines.length, (int index) {
                    final CartLine line = lines[index];
                    return Padding(
                      padding:
                          EdgeInsets.only(bottom: index == lines.length - 1 ? 0 : 12),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: const Color(0xFFE5E7EB)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Row(
                              children: <Widget>[
                                Expanded(
                                  child: Text(
                                    line.title,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 16,
                                    ),
                                  ),
                                ),
                                Text(
                                  formatMoney(line.lineTotal, whole: true),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    color: _brandOrange,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: <Widget>[
                                _SmallTag(text: line.color),
                                _SmallTag(text: _normalizeSizeLabel(line.size)),
                                _SmallTag(
                                  text: '${formatMoney(line.unitPrice, whole: true)} each',
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: <Widget>[
                                Expanded(
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(
                                        color: const Color(0xFFE5E7EB),
                                      ),
                                    ),
                                    child: Row(
                                      children: <Widget>[
                                        IconButton(
                                          onPressed: line.quantity > 1
                                              ? () => onUpdateQuantity(
                                                    index,
                                                    line.quantity - 1,
                                                  )
                                              : null,
                                          icon: const Icon(Icons.remove_rounded),
                                        ),
                                        Expanded(
                                          child: Text(
                                            line.quantity.toString(),
                                            textAlign: TextAlign.center,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                        ),
                                        IconButton(
                                          onPressed: () => onUpdateQuantity(
                                            index,
                                            line.quantity + 1,
                                          ),
                                          icon: const Icon(Icons.add_rounded),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                OutlinedButton(
                                  onPressed: () => onRemoveLine(index),
                                  child: const Text('Remove'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                const SizedBox(height: 18),
                DropdownButtonFormField<String>(
                  initialValue: deliveryMethod.value,
                  decoration: const InputDecoration(labelText: 'Delivery'),
                  items: _deliveryMethods
                      .map(
                        (DeliveryMethod method) => DropdownMenuItem<String>(
                          value: method.value,
                          child: Text(method.label),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (String? value) {
                    if (value == null) {
                      return;
                    }
                    onDeliveryMethodChanged(
                      _deliveryMethods.firstWhere(
                        (DeliveryMethod method) => method.value == value,
                      ),
                    );
                  },
                ),
                if (_deliveryInfoRequired) ...<Widget>[
                  const SizedBox(height: 12),
                  TextFormField(
                    initialValue: deliveryInfo.name,
                    decoration: const InputDecoration(labelText: 'Delivery name'),
                    onChanged: (String value) {
                      onDeliveryInfoChanged(
                        deliveryInfo.copyWith(name: value),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    initialValue: deliveryInfo.address,
                    minLines: 2,
                    maxLines: 4,
                    decoration:
                        const InputDecoration(labelText: 'Delivery address'),
                    onChanged: (String value) {
                      onDeliveryInfoChanged(
                        deliveryInfo.copyWith(address: value),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    initialValue: deliveryInfo.postCode,
                    decoration: const InputDecoration(labelText: 'Post code'),
                    onChanged: (String value) {
                      onDeliveryInfoChanged(
                        deliveryInfo.copyWith(postCode: value),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    initialValue: deliveryInfo.phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Phone'),
                    onChanged: (String value) {
                      onDeliveryInfoChanged(
                        deliveryInfo.copyWith(phone: value),
                      );
                    },
                  ),
                ],
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Column(
                    children: <Widget>[
                      _PriceRow(label: 'Subtotal', value: subtotal),
                      if (deliveryFee > 0)
                        _PriceRow(label: 'Delivery fee', value: deliveryFee),
                      const Divider(height: 22),
                      _PriceRow(label: 'Total', value: total, emphasize: true),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: _canSend
                      ? () => launchExternalUri(
                            Uri.parse(
                              'https://wa.me/23059883880?text=${Uri.encodeComponent(buildWhatsAppMessageForLines(lines, deliveryMethod.value, subtotal, deliveryFee, total, deliveryInfo))}',
                            ),
                          )
                      : null,
                  icon: const Icon(Icons.chat_rounded),
                  label: const Text('Send order on WhatsApp'),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: onRequestQuote,
                  icon: const Icon(Icons.request_quote_rounded),
                  label: const Text('Need formal pricing? Use quote form'),
                ),
                if (lines.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: onClear,
                    child: const Text('Clear order list'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeaturedProductCard extends StatelessWidget {
  const _FeaturedProductCard({
    required this.item,
    required this.onTap,
  });

  final ShopItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(26),
      child: Ink(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(26)),
                child: _ProductImage(imageUrl: item.photoUrl, title: item.title),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item.isOneSize
                        ? formatMoney(item.minPrice, whole: true)
                        : 'From ${formatMoney(item.minPrice, whole: true)}',
                    style: const TextStyle(
                      color: _brandOrange,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactActionCard extends StatelessWidget {
  const _ContactActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String cta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: <Widget>[
          CircleAvatar(
            radius: 22,
            backgroundColor: const Color(0xFFFFF1E5),
            child: Icon(icon, color: _brandOrange, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.black54,
                    fontSize: 13,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          FilledButton(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              minimumSize: const Size(84, 40),
              textStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
            child: Text(cta),
          ),
        ],
      ),
    );
  }
}

class _BusinessInfoCard extends StatelessWidget {
  const _BusinessInfoCard({
    required this.title,
    required this.lines,
  });

  final String title;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
          ),
          const SizedBox(height: 10),
          ...lines.map(
            (String line) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(line),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionPanel extends StatelessWidget {
  const _ActionPanel({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          CircleAvatar(
            radius: 24,
            backgroundColor: const Color(0xFFFFF1E5),
            child: Icon(icon, color: _brandOrange),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: const TextStyle(color: Colors.black54, height: 1.45),
                ),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: onTap, child: Text(actionLabel)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.helper,
  });

  final String label;
  final String value;
  final String helper;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            style: const TextStyle(
              color: Colors.black54,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            helper,
            style: const TextStyle(color: Colors.black45, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _InfoStrip extends StatelessWidget {
  const _InfoStrip({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: <Widget>[
          CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFFFFF1E5),
            child: Icon(icon, size: 18, color: _brandOrange),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.black54,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: const TextStyle(color: Colors.black54, height: 1.4),
              ),
            ],
          ),
        ),
        if (trailing case final Widget trailingWidget) trailingWidget,
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final double value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: emphasize ? FontWeight.w900 : FontWeight.w700,
            ),
          ),
        ),
        Text(
          formatMoney(value, whole: true),
          style: TextStyle(
            fontWeight: emphasize ? FontWeight.w900 : FontWeight.w700,
            fontSize: emphasize ? 16 : 14,
          ),
        ),
      ],
    );
  }
}

class _ColorPill extends StatelessWidget {
  const _ColorPill({required this.color});

  final String color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: getColorSwatch(color),
              border: Border.all(color: Colors.black12),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            color,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _SmallTag extends StatelessWidget {
  const _SmallTag({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: _brandSand,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}

class _ProductImage extends StatelessWidget {
  const _ProductImage({
    required this.imageUrl,
    required this.title,
  });

  final String? imageUrl;
  final String title;

  @override
  Widget build(BuildContext context) {
    if (imageUrl == null || imageUrl!.trim().isEmpty) {
      return Container(
        color: Colors.white,
        child: const Center(
          child: Icon(
            Icons.image_not_supported_rounded,
            color: Colors.black26,
            size: 36,
          ),
        ),
      );
    }

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(18),
      child: Image.network(
        imageUrl!,
        fit: BoxFit.contain,
        errorBuilder: (
          BuildContext context,
          Object error,
          StackTrace? stackTrace,
        ) {
          return Center(
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.black45,
                fontWeight: FontWeight.w700,
              ),
            ),
          );
        },
        loadingBuilder: (
          BuildContext context,
          Widget child,
          ImageChunkEvent? loadingProgress,
        ) {
          if (loadingProgress == null) {
            return child;
          }
          return const Center(
            child: CircularProgressIndicator(color: _brandOrange),
          );
        },
      ),
    );
  }
}

class _FailureState extends StatelessWidget {
  const _FailureState({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off_rounded, size: 44, color: Colors.black26),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: Color(0xFFB91C1C),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.black54, height: 1.45),
      ),
    );
  }
}

Future<void> launchExternalUri(Uri uri) async {
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

String buildWhatsAppMessageForLines(
  List<CartLine> lines,
  String deliveryMethod,
  double subtotal,
  double deliveryFee,
  double total,
  DeliveryInfo deliveryInfo,
) {
  final StringBuffer buffer = StringBuffer("Hi! I'd like to order:\n");
  if (lines.isNotEmpty) {
    buffer.writeln('Items:');
    for (final CartLine line in lines) {
      final List<String> parts = <String>[
        '- ${line.title}',
        'Color: ${line.color}',
        if (!_isOneSizeLabel(line.size))
          'Size: ${_normalizeSizeLabel(line.size)}',
        'Qty: ${line.quantity}',
        'Price: ${formatMoney(line.unitPrice, whole: true)}',
        'Line total: ${formatMoney(line.lineTotal, whole: true)}',
      ];
      buffer.writeln(parts.join(' | '));
    }
  }

  buffer.writeln('Delivery: $deliveryMethod');

  if (deliveryMethod != 'Surinam pickup') {
    buffer.writeln('Delivery Info:');
    buffer.writeln('Name: ${deliveryInfo.name.trim()}');
    buffer.writeln('Address: ${deliveryInfo.address.trim()}');
    if (deliveryInfo.postCode.trim().isNotEmpty) {
      buffer.writeln('Post Code: ${deliveryInfo.postCode.trim()}');
    }
    buffer.writeln('Phone: ${deliveryInfo.phone.trim()}');
  }

  buffer.writeln('Subtotal: ${formatMoney(subtotal, whole: true)}');
  if (deliveryFee > 0) {
    buffer.writeln('Delivery fee ($deliveryMethod): ${formatMoney(deliveryFee, whole: true)}');
  }
  buffer.writeln('Total: ${formatMoney(total, whole: true)}');
  return buffer.toString().trim();
}

String formatMoney(num value, {bool whole = false}) {
  final double safe = value.isFinite ? value.toDouble() : 0;
  final double absolute = safe.abs();
  final String formatted = whole
      ? _formatThousands(absolute.round().toString())
      : _formatDecimalMoney(absolute);
  final String sign = safe < 0 ? '-' : '';
  return '$sign'
      'Rs $formatted';
}

String _formatDecimalMoney(double value) {
  final String base = value.toStringAsFixed(
    value == value.roundToDouble() ? 0 : 2,
  );
  final List<String> parts = base.split('.');
  final String whole = _formatThousands(parts.first);
  if (parts.length == 1) {
    return whole;
  }
  return '$whole.${parts.last}';
}

String _formatThousands(String digits) {
  final String sanitized = digits.replaceAll(RegExp(r'[^0-9]'), '');
  if (sanitized.isEmpty) {
    return '0';
  }
  final StringBuffer buffer = StringBuffer();
  for (int index = 0; index < sanitized.length; index += 1) {
    final int remaining = sanitized.length - index;
    buffer.write(sanitized[index]);
    if (remaining > 1 && remaining % 3 == 1) {
      buffer.write(',');
    }
  }
  return buffer.toString();
}

double _toDouble(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

String _normalizeSizeLabel(String value) {
  final String trimmed =
      value.replaceAll(RegExp(r'\s+Old$', caseSensitive: false), '').trim();
  if (trimmed.isEmpty) {
    return '';
  }
  final String normalized = trimmed.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  const Set<String> aliases = <String>{
    'one size',
    'one-size',
    'onesize',
    'free size',
    'free-size',
    'freesize',
    'default',
    'standard',
    'no size',
    'no-size',
    'nosize',
  };
  if (aliases.contains(normalized)) {
    return 'One size';
  }

  final String compact = trimmed.replaceAll(' ', '').toUpperCase();
  if (compact == 'XXL' || compact == '2XL') {
    return '2XL';
  }
  if (compact == 'XXXL' || compact == '3XL') {
    return '3XL';
  }
  if (compact == 'XXXXL' || compact == '4XL') {
    return '4XL';
  }
  return trimmed;
}

bool _isOneSizeLabel(String value) => _normalizeSizeLabel(value) == 'One size';

String? _normalizeRemoteUrl(String? rawUrl) {
  final String trimmed = (rawUrl ?? '').trim();
  if (trimmed.isEmpty) {
    return null;
  }

  final Uri? parsed = Uri.tryParse(trimmed);
  if (parsed == null) {
    return null;
  }

  if (parsed.hasScheme) {
    return parsed.toString();
  }

  final Uri base = Uri.parse(_siteBaseUrl);
  return base.resolveUri(parsed).toString();
}

String? _contentTypeForFileName(String fileName) {
  final String lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return null;
}

Color getColorSwatch(String color) {
  final String normalized = color.toLowerCase().trim();
  for (final ColorSwatchRule rule in _colorSwatchRules) {
    if (rule.match.any(normalized.contains)) {
      return rule.value;
    }
  }
  return const Color(0xFFD4D4D8);
}
