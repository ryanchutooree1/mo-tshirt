import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const MoTshirtApp());
}

final Uri _websiteUri = Uri.parse('https://www.mo-tshirt.mu');
final Uri _shopUri = Uri.parse('https://www.mo-tshirt.mu/shops');
final Uri _quoteUri = Uri.parse('https://www.mo-tshirt.mu/contact');
final Uri _whatsAppUri = Uri.parse('https://wa.me/23059883880?text=Hi%2C%20I%20need%20printing.');
final Uri _phoneUri = Uri.parse('tel:+23059883880');
final Uri _emailUri = Uri.parse('mailto:motshirtmauritius@gmail.com');

class MoTshirtApp extends StatelessWidget {
  const MoTshirtApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MO T-SHIRT',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFFF6600),
          primary: const Color(0xFFFF6600),
          surface: const Color(0xFFFFFBF8),
        ),
        scaffoldBackgroundColor: const Color(0xFFFFFBF8),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: const Color(0xFFFF6600),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.checkroom_rounded, color: Colors.white, size: 36),
              ),
              const SizedBox(height: 24),
              Text(
                'MO T-SHIRT',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF161616),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'The new mobile app shell is ready. This first version gives you a branded base for iPhone and Android while keeping the website live.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF4D4D4D),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: const [
                  _Tag(label: 'iPhone ready'),
                  _Tag(label: 'Android ready'),
                  _Tag(label: 'Flutter codebase'),
                ],
              ),
              const SizedBox(height: 28),
              const _PrimaryActionRow(),
              const SizedBox(height: 28),
              const _SectionTitle('What this app will become'),
              const SizedBox(height: 14),
              const _FeatureCard(
                icon: Icons.storefront_rounded,
                title: 'Shop and catalogue',
                description: 'Browse products, prices, sizes, and plain stock from the same business.',
              ),
              const SizedBox(height: 12),
              const _FeatureCard(
                icon: Icons.request_quote_rounded,
                title: 'Fast quote flow',
                description: 'Collect printing details, quantities, contact data, and delivery needs inside the app.',
              ),
              const SizedBox(height: 12),
              const _FeatureCard(
                icon: Icons.smart_toy_rounded,
                title: 'MO assistant later',
                description: 'Your AI ordering and lead handling flow can be added after the core app screens are stable.',
              ),
              const SizedBox(height: 28),
              const _SectionTitle('Quick actions'),
              const SizedBox(height: 14),
              _QuickLinkTile(
                icon: Icons.language_rounded,
                title: 'Open website',
                subtitle: 'Launch the current public site',
                onTap: () => _openUri(_websiteUri),
              ),
              const SizedBox(height: 12),
              _QuickLinkTile(
                icon: Icons.shopping_bag_rounded,
                title: 'Open plain shops',
                subtitle: 'Jump to the current online catalogue',
                onTap: () => _openUri(_shopUri),
              ),
              const SizedBox(height: 12),
              _QuickLinkTile(
                icon: Icons.chat_rounded,
                title: 'WhatsApp the business',
                subtitle: '+230 5988 3880',
                onTap: () => _openUri(_whatsAppUri),
              ),
              const SizedBox(height: 12),
              _QuickLinkTile(
                icon: Icons.call_rounded,
                title: 'Call now',
                subtitle: 'Direct phone action from the app',
                onTap: () => _openUri(_phoneUri),
              ),
              const SizedBox(height: 12),
              _QuickLinkTile(
                icon: Icons.mail_rounded,
                title: 'Email',
                subtitle: 'motshirtmauritius@gmail.com',
                onTap: () => _openUri(_emailUri),
              ),
              const SizedBox(height: 24),
              Text(
                'Next step: replace these quick links with native catalogue, quote, and order screens backed by your existing website services.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF666666),
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openUri(Uri uri) async {
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) {
      throw Exception('Could not open $uri');
    }
  }
}

class _PrimaryActionRow extends StatelessWidget {
  const _PrimaryActionRow();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => _launch(_quoteUri),
            icon: const Icon(Icons.request_quote_rounded),
            label: const Text('Request a quote'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF6600),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () => _launch(_whatsAppUri),
            icon: const Icon(Icons.chat_bubble_outline_rounded),
            label: const Text('Open WhatsApp'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF161616),
              side: const BorderSide(color: Color(0xFFFF6600)),
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _launch(Uri uri) async {
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) {
      throw Exception('Could not open $uri');
    }
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context).textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w800,
        color: const Color(0xFF161616),
      ),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFFFD7BF)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: const Color(0xFFFFF0E7),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: const Color(0xFFFF6600)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF161616),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  description,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF5A5A5A),
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickLinkTile extends StatelessWidget {
  const _QuickLinkTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF0E7),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: const Color(0xFFFF6600)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF161616),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF666666),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_ios_rounded, size: 18, color: Color(0xFF8A8A8A)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFFFD7BF)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          color: const Color(0xFF8A3E0A),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
