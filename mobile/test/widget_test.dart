import 'package:flutter_test/flutter_test.dart';
import 'package:mo_tshirt_mobile/main.dart';

void main() {
  testWidgets('renders native MO T-SHIRT mobile app', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MoTshirtApp(repository: _FakeMoRepository()),
    );
    await tester.pumpAndSettle();

    expect(find.text('Mauritius printing, without the website detour.'), findsOneWidget);
    expect(find.text('Browse catalogue'), findsOneWidget);
    expect(find.text('Request quote'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
  });
}

class _FakeMoRepository implements MoRepository {
  @override
  Future<AppBootstrapData> loadBootstrapData() async {
    return AppBootstrapData(
      shopItems: const <ShopItem>[
        ShopItem(
          id: '1',
          title: 'Plain Poloshirt',
          colors: <String>['Soft Pastel Yellow', 'Black'],
          sizePrices: <ShopSizePrice>[
            ShopSizePrice(size: 'M', price: 450),
            ShopSizePrice(size: 'L', price: 450),
          ],
          pickupPoint: 'Nouvelle France',
          collectionPoint: 'Surinam',
          photoUrl: null,
          inStock: true,
        ),
      ],
      quoteOptions: const QuoteOptions(
        colors: <String>['Black', 'White'],
        colorsByGarment: <String, List<String>>{
          'T-Shirt': <String>['Black', 'White'],
        },
      ),
    );
  }

  @override
  Future<QuoteSubmissionResult> submitQuote(
    QuoteSubmissionPayload payload,
  ) async {
    return const QuoteSubmissionResult(
      message: 'Thanks! We received your message.',
      quoteId: 'TEST-1',
    );
  }
}
