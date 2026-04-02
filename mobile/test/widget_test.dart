import 'package:flutter_test/flutter_test.dart';
import 'package:mo_tshirt_mobile/main.dart';

void main() {
  testWidgets('renders MO T-SHIRT shell', (WidgetTester tester) async {
    await tester.pumpWidget(const MoTshirtApp());

    expect(find.text('MO T-SHIRT'), findsOneWidget);
    expect(find.text('Request a quote'), findsOneWidget);
    expect(find.text('Open WhatsApp'), findsOneWidget);
  });
}
