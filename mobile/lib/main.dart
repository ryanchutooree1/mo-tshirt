import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

const Color _brandOrange = Color(0xFFFF6600);
const Color _brandCream = Color(0xFFFFFBF8);
const Color _ink = Color(0xFF161616);
const String _siteBaseUrl = 'https://www.mo-tshirt.mu';
const String _siteHost = 'www.mo-tshirt.mu';

final Uri _websiteUri = Uri.parse(_siteBaseUrl);
final Uri _whatsAppUri = Uri.parse('https://wa.me/23059883880?text=Hi%2C%20I%20need%20printing.');
final Uri _phoneUri = Uri.parse('tel:+23059883880');
final Uri _emailUri = Uri.parse('mailto:motshirtmauritius@gmail.com');

void main() {
  runApp(const MoTshirtApp());
}

class MoTshirtApp extends StatelessWidget {
  const MoTshirtApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MO T-SHIRT',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: _brandOrange,
          primary: _brandOrange,
          surface: _brandCream,
        ),
        scaffoldBackgroundColor: _brandCream,
        useMaterial3: true,
      ),
      home: const HomeShell(),
    );
  }
}

enum RootTab {
  home,
  website,
  shop,
  quote,
  more,
}

class WebDestination {
  const WebDestination({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.uri,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Uri uri;
}

final WebDestination _websiteDestination = WebDestination(
  title: 'Website',
  subtitle: 'Full public website inside the app',
  icon: Icons.language_rounded,
  uri: Uri.parse(_siteBaseUrl),
);

final WebDestination _shopDestination = WebDestination(
  title: 'Shop',
  subtitle: 'Browse plain garments and order options',
  icon: Icons.shopping_bag_rounded,
  uri: Uri.parse('$_siteBaseUrl/shops'),
);

final WebDestination _quoteDestination = WebDestination(
  title: 'Quote',
  subtitle: 'Get a fast quote from the live contact page',
  icon: Icons.request_quote_rounded,
  uri: Uri.parse('$_siteBaseUrl/contact'),
);

final WebDestination _aiOrderDestination = WebDestination(
  title: 'MO AI Order',
  subtitle: 'Jump straight to the AI order section',
  icon: Icons.smart_toy_rounded,
  uri: Uri.parse('$_siteBaseUrl/#mo-ai-order'),
);

final WebDestination _ourWorkDestination = WebDestination(
  title: 'Our Work',
  subtitle: 'View examples and proof of work',
  icon: Icons.photo_library_rounded,
  uri: Uri.parse('$_siteBaseUrl/#our-work'),
);

final WebDestination _termsDestination = WebDestination(
  title: 'Terms',
  subtitle: 'Read the website terms and conditions',
  icon: Icons.gavel_rounded,
  uri: Uri.parse('$_siteBaseUrl/terms'),
);

final WebDestination _privacyDestination = WebDestination(
  title: 'Privacy',
  subtitle: 'Read the website privacy policy',
  icon: Icons.privacy_tip_rounded,
  uri: Uri.parse('$_siteBaseUrl/privacy'),
);

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  RootTab _currentTab = RootTab.home;
  final Map<RootTab, Widget> _tabCache = {};

  @override
  void initState() {
    super.initState();
    _tabCache[RootTab.home] = HomeDashboard(
      onSelectTab: _selectTab,
      onOpenDestination: _openDestination,
      onLaunchExternal: _launchExternal,
    );
    _tabCache[RootTab.more] = MoreHub(
      onOpenDestination: _openDestination,
      onLaunchExternal: _launchExternal,
    );
  }

  @override
  Widget build(BuildContext context) {
    _tabCache.putIfAbsent(_currentTab, () => _createTab(_currentTab));

    return Scaffold(
      body: IndexedStack(
        index: RootTab.values.indexOf(_currentTab),
        children: RootTab.values
            .map((tab) => _tabCache[tab] ?? const SizedBox.shrink())
            .toList(growable: false),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: RootTab.values.indexOf(_currentTab),
        onDestinationSelected: (index) => _selectTab(RootTab.values[index]),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.language_rounded),
            label: 'Website',
          ),
          NavigationDestination(
            icon: Icon(Icons.shopping_bag_rounded),
            label: 'Shop',
          ),
          NavigationDestination(
            icon: Icon(Icons.request_quote_rounded),
            label: 'Quote',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_rounded),
            label: 'More',
          ),
        ],
      ),
    );
  }

  Widget _createTab(RootTab tab) {
    switch (tab) {
      case RootTab.home:
        return HomeDashboard(
          onSelectTab: _selectTab,
          onOpenDestination: _openDestination,
          onLaunchExternal: _launchExternal,
        );
      case RootTab.website:
        return BrowserTab(destination: _websiteDestination);
      case RootTab.shop:
        return BrowserTab(destination: _shopDestination);
      case RootTab.quote:
        return BrowserTab(destination: _quoteDestination);
      case RootTab.more:
        return MoreHub(
          onOpenDestination: _openDestination,
          onLaunchExternal: _launchExternal,
        );
    }
  }

  void _selectTab(RootTab tab) {
    setState(() {
      _tabCache.putIfAbsent(tab, () => _createTab(tab));
      _currentTab = tab;
    });
  }

  Future<void> _launchExternal(Uri uri) async {
    await _launchUri(uri, external: true);
  }

  Future<void> _openDestination(WebDestination destination) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StandaloneBrowserPage(destination: destination),
      ),
    );
  }
}

class HomeDashboard extends StatelessWidget {
  const HomeDashboard({
    super.key,
    required this.onSelectTab,
    required this.onOpenDestination,
    required this.onLaunchExternal,
  });

  final ValueChanged<RootTab> onSelectTab;
  final ValueChanged<WebDestination> onOpenDestination;
  final ValueChanged<Uri> onLaunchExternal;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _BrandHeader(
              title: 'MO T-SHIRT',
              subtitle: 'Customer mobile app with the most useful public website features built in.',
            ),
            const SizedBox(height: 20),
            _HeroCard(
              onBrowseShop: () => onSelectTab(RootTab.shop),
              onGetQuote: () => onSelectTab(RootTab.quote),
            ),
            const SizedBox(height: 24),
            const _SectionHeading(
              title: 'Popular',
              subtitle: 'Fast access to the live public pages you use most.',
            ),
            const SizedBox(height: 12),
            _ActionCard(
              icon: Icons.language_rounded,
              title: 'Full website',
              subtitle: 'Browse the whole public site inside the app.',
              onTap: () => onSelectTab(RootTab.website),
            ),
            const SizedBox(height: 12),
            _ActionCard(
              icon: Icons.shopping_bag_rounded,
              title: 'Plain shops',
              subtitle: 'Open the catalogue and order plain garments.',
              onTap: () => onSelectTab(RootTab.shop),
            ),
            const SizedBox(height: 12),
            _ActionCard(
              icon: Icons.request_quote_rounded,
              title: 'Fast quote',
              subtitle: 'Use the website quote/contact page in app.',
              onTap: () => onSelectTab(RootTab.quote),
            ),
            const SizedBox(height: 12),
            _ActionCard(
              icon: Icons.smart_toy_rounded,
              title: 'MO AI Order',
              subtitle: 'Jump directly to the AI ordering section.',
              onTap: () => onOpenDestination(_aiOrderDestination),
            ),
            const SizedBox(height: 24),
            const _SectionHeading(
              title: 'Website Shortcuts',
              subtitle: 'Useful public pages from the website packaged for mobile.',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _ShortcutChip(
                  icon: Icons.photo_library_rounded,
                  label: 'Our Work',
                  onTap: () => onOpenDestination(_ourWorkDestination),
                ),
                _ShortcutChip(
                  icon: Icons.privacy_tip_rounded,
                  label: 'Privacy',
                  onTap: () => onOpenDestination(_privacyDestination),
                ),
                _ShortcutChip(
                  icon: Icons.gavel_rounded,
                  label: 'Terms',
                  onTap: () => onOpenDestination(_termsDestination),
                ),
                _ShortcutChip(
                  icon: Icons.open_in_browser_rounded,
                  label: 'Browser',
                  onTap: () => onLaunchExternal(_websiteUri),
                ),
              ],
            ),
            const SizedBox(height: 24),
            const _SectionHeading(
              title: 'Contact',
              subtitle: 'Native actions that open instantly on the phone.',
            ),
            const SizedBox(height: 12),
            _ContactCard(
              onWhatsApp: () => onLaunchExternal(_whatsAppUri),
              onCall: () => onLaunchExternal(_phoneUri),
              onEmail: () => onLaunchExternal(_emailUri),
            ),
          ],
        ),
      ),
    );
  }
}

class MoreHub extends StatelessWidget {
  const MoreHub({
    super.key,
    required this.onOpenDestination,
    required this.onLaunchExternal,
  });

  final ValueChanged<WebDestination> onOpenDestination;
  final ValueChanged<Uri> onLaunchExternal;

  @override
  Widget build(BuildContext context) {
    final moreDestinations = <WebDestination>[
      _aiOrderDestination,
      _ourWorkDestination,
      _termsDestination,
      _privacyDestination,
    ];

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        children: [
          const _BrandHeader(
            title: 'More',
            subtitle: 'Everything else worth keeping from the website, plus direct contact actions.',
          ),
          const SizedBox(height: 20),
          const _SectionHeading(
            title: 'Pages',
            subtitle: 'Open these public routes in a full in-app browser screen.',
          ),
          const SizedBox(height: 12),
          for (final destination in moreDestinations) ...[
            _ActionCard(
              icon: destination.icon,
              title: destination.title,
              subtitle: destination.subtitle,
              onTap: () => onOpenDestination(destination),
            ),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 12),
          const _SectionHeading(
            title: 'Direct Actions',
            subtitle: 'Use phone-native actions when you want the fastest path.',
          ),
          const SizedBox(height: 12),
          _ActionCard(
            icon: Icons.chat_rounded,
            title: 'WhatsApp',
            subtitle: '+230 5988 3880',
            onTap: () => onLaunchExternal(_whatsAppUri),
          ),
          const SizedBox(height: 12),
          _ActionCard(
            icon: Icons.call_rounded,
            title: 'Call',
            subtitle: 'Start a phone call to the business',
            onTap: () => onLaunchExternal(_phoneUri),
          ),
          const SizedBox(height: 12),
          _ActionCard(
            icon: Icons.mail_rounded,
            title: 'Email',
            subtitle: 'motshirtmauritius@gmail.com',
            onTap: () => onLaunchExternal(_emailUri),
          ),
          const SizedBox(height: 12),
          _ActionCard(
            icon: Icons.open_in_browser_rounded,
            title: 'Open website in browser',
            subtitle: 'Launch Safari/Chrome for the public site',
            onTap: () => onLaunchExternal(_websiteUri),
          ),
        ],
      ),
    );
  }
}

class StandaloneBrowserPage extends StatelessWidget {
  const StandaloneBrowserPage({
    super.key,
    required this.destination,
  });

  final WebDestination destination;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: BrowserScaffold(
          destination: destination,
          canClose: true,
        ),
      ),
    );
  }
}

class BrowserTab extends StatelessWidget {
  const BrowserTab({
    super.key,
    required this.destination,
  });

  final WebDestination destination;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: BrowserScaffold(destination: destination),
    );
  }
}

class BrowserScaffold extends StatefulWidget {
  const BrowserScaffold({
    super.key,
    required this.destination,
    this.canClose = false,
  });

  final WebDestination destination;
  final bool canClose;

  @override
  State<BrowserScaffold> createState() => _BrowserScaffoldState();
}

class _BrowserScaffoldState extends State<BrowserScaffold> {
  late final WebViewController _controller;
  int _progress = 0;
  bool _canGoBack = false;
  bool _canGoForward = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (!mounted) {
              return;
            }
            setState(() {
              _progress = progress;
            });
          },
          onPageStarted: (_) {
            if (!mounted) {
              return;
            }
            setState(() {
              _errorText = null;
            });
          },
          onPageFinished: (_) {
            _refreshNavigationState();
          },
          onWebResourceError: (error) {
            if (!mounted || error.isForMainFrame == false) {
              return;
            }
            setState(() {
              _errorText = error.description;
            });
          },
          onNavigationRequest: (request) async {
            final uri = Uri.tryParse(request.url);
            if (uri == null) {
              return NavigationDecision.navigate;
            }
            if (_shouldOpenExternally(uri)) {
              await _launchUri(uri, external: true);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(widget.destination.uri);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _BrowserHeader(
          destination: widget.destination,
          canClose: widget.canClose,
          canGoBack: _canGoBack,
          canGoForward: _canGoForward,
          onBack: _canGoBack ? () => _controller.goBack() : null,
          onForward: _canGoForward ? () => _controller.goForward() : null,
          onRefresh: () => _controller.reload(),
          onOpenExternal: () => _launchUri(widget.destination.uri, external: true),
        ),
        if (_progress < 100)
          LinearProgressIndicator(
            value: _progress == 0 ? null : _progress / 100,
            minHeight: 2,
            color: _brandOrange,
          ),
        Expanded(
          child: _errorText == null
              ? WebViewWidget(controller: _controller)
              : _BrowserErrorState(
                  message: _errorText!,
                  onRetry: () {
                    setState(() {
                      _errorText = null;
                    });
                    _controller.loadRequest(widget.destination.uri);
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _refreshNavigationState() async {
    final canGoBack = await _controller.canGoBack();
    final canGoForward = await _controller.canGoForward();
    if (!mounted) {
      return;
    }
    setState(() {
      _canGoBack = canGoBack;
      _canGoForward = canGoForward;
      _progress = 100;
    });
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFFFD7BF)),
          ),
          child: Image.asset(
            'assets/logo.png',
            width: 120,
            fit: BoxFit.contain,
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: _ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF555555),
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.onBrowseShop,
    required this.onGetQuote,
  });

  final VoidCallback onBrowseShop;
  final VoidCallback onGetQuote;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFF7F2A), Color(0xFFFF5B00)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Maximum useful website features, packaged for mobile.',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Use the live website routes inside the app for shopping, quoting, AI order flow, contact, and business information.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Colors.white.withValues(alpha: 0.92),
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: onBrowseShop,
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: _brandOrange,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Browse shop'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: onGetQuote,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Get quote'),
                ),
              ),
            ],
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
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: _ink,
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
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
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
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF0E7),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: _brandOrange),
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
                        color: _ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF666666),
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward_ios_rounded, size: 16, color: Color(0xFF808080)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShortcutChip extends StatelessWidget {
  const _ShortcutChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 18, color: _brandOrange),
      label: Text(label),
      onPressed: onTap,
      backgroundColor: Colors.white,
      side: const BorderSide(color: Color(0xFFFFD7BF)),
      labelStyle: const TextStyle(
        color: _ink,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({
    required this.onWhatsApp,
    required this.onCall,
    required this.onEmail,
  });

  final VoidCallback onWhatsApp;
  final VoidCallback onCall;
  final VoidCallback onEmail;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFFFD7BF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Reach MO T-SHIRT quickly',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: _ink,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Phone / WhatsApp: +230 5988 3880\nEmail: motshirtmauritius@gmail.com',
            style: TextStyle(color: Color(0xFF666666), height: 1.5),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton.icon(
                onPressed: onWhatsApp,
                icon: const Icon(Icons.chat_rounded),
                label: const Text('WhatsApp'),
                style: FilledButton.styleFrom(backgroundColor: _brandOrange),
              ),
              OutlinedButton.icon(
                onPressed: onCall,
                icon: const Icon(Icons.call_rounded),
                label: const Text('Call'),
              ),
              OutlinedButton.icon(
                onPressed: onEmail,
                icon: const Icon(Icons.mail_rounded),
                label: const Text('Email'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BrowserHeader extends StatelessWidget {
  const _BrowserHeader({
    required this.destination,
    required this.canGoBack,
    required this.canGoForward,
    required this.onBack,
    required this.onForward,
    required this.onRefresh,
    required this.onOpenExternal,
    required this.canClose,
  });

  final WebDestination destination;
  final bool canGoBack;
  final bool canGoForward;
  final VoidCallback? onBack;
  final VoidCallback? onForward;
  final VoidCallback onRefresh;
  final VoidCallback onOpenExternal;
  final bool canClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Color(0xFFFFE3D2))),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (canClose)
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      destination.title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: _ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      destination.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF777777),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Open in browser',
                icon: const Icon(Icons.open_in_browser_rounded),
                onPressed: onOpenExternal,
              ),
            ],
          ),
          Row(
            children: [
              IconButton(
                tooltip: 'Back',
                onPressed: canGoBack ? onBack : null,
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              IconButton(
                tooltip: 'Forward',
                onPressed: canGoForward ? onForward : null,
                icon: const Icon(Icons.arrow_forward_rounded),
              ),
              IconButton(
                tooltip: 'Refresh',
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BrowserErrorState extends StatelessWidget {
  const _BrowserErrorState({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 48, color: Color(0xFF8A8A8A)),
            const SizedBox(height: 12),
            Text(
              'Page failed to load',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF666666),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              style: FilledButton.styleFrom(backgroundColor: _brandOrange),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

bool _shouldOpenExternally(Uri uri) {
  if (uri.scheme == 'tel' || uri.scheme == 'mailto' || uri.scheme == 'sms') {
    return true;
  }

  if (uri.host == 'wa.me' || uri.host.contains('whatsapp')) {
    return true;
  }

  if (uri.scheme == 'http' || uri.scheme == 'https') {
    return !_isInternalWebsite(uri);
  }

  return true;
}

bool _isInternalWebsite(Uri uri) {
  return uri.host == _siteHost || uri.host == 'mo-tshirt.mu';
}

Future<void> _launchUri(Uri uri, {bool external = false}) async {
  final mode = external ? LaunchMode.externalApplication : LaunchMode.platformDefault;
  final launched = await launchUrl(uri, mode: mode);
  if (!launched) {
    throw Exception('Could not open $uri');
  }
}
