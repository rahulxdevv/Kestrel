import { useEffect, useState } from 'react';

/**
 * A deliberately small i18n layer: flat keys, one dictionary per locale, English as the fallback.
 * It ships in the dashboard bundle (no runtime fetch, no extra request on first paint) and the
 * chosen language is remembered per browser.
 */

export type Locale = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'hi' | 'ja' | 'zh';

export const LOCALES: { value: Locale; label: string; native: string }[] = [
  { value: 'en', label: 'English', native: 'English' },
  { value: 'es', label: 'Spanish', native: 'Español' },
  { value: 'de', label: 'German', native: 'Deutsch' },
  { value: 'fr', label: 'French', native: 'Français' },
  { value: 'pt', label: 'Portuguese', native: 'Português' },
  { value: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { value: 'ja', label: 'Japanese', native: '日本語' },
  { value: 'zh', label: 'Chinese', native: '中文' },
];

type Dict = Record<string, string>;

const en: Dict = {
  'nav.overview': 'Overview',
  'nav.realtime': 'Live',
  'nav.content': 'Content',
  'nav.audience': 'Audience',
  'nav.goals': 'Goals & funnels',
  'nav.settings': 'Settings',
  'nav.sites': 'Websites',
  'nav.agents': 'Agents',

  'common.visitors': 'Visitors',
  'common.revenue': 'Revenue',
  'common.sales': 'Sales',
  'common.online': 'Online now',
  'common.conversion': 'Conversion',
  'common.direct': 'Direct',
  'common.none': 'Nothing yet',
  'common.learnMore': 'Learn more',

  'sites.title': 'Websites',
  'sites.add': 'Add website',
  'sites.all': 'All websites',
  'sites.sort': 'Sort',
  'sites.sort.online': 'Online now',
  'sites.sort.revenue': 'Revenue',
  'sites.sort.visitors': 'Visitors',
  'sites.sort.name': 'Name',
  'sites.period7': '7 days',
  'sites.period30': '30 days',
  'sites.avgOrder': 'Avg. order',
  'sites.sitesOnline': 'of {n} sites online',
  'sites.visitorsToday': 'Visitors today',
  'sites.revenueWindow': 'Revenue ({days}d)',
  'sites.empty': 'No websites yet',
  'sites.emptyHint': 'Add your domain to get a one-line tracking snippet and see traffic and revenue in a minute.',

  'overview.title': 'Overview',
  'overview.chart': 'Visitors & revenue',
  'overview.new': 'new',
  'overview.returning': 'returning',
  'overview.vsPrevious': 'vs previous period',
  'overview.last5': 'last 5 minutes',
  'overview.bounce': 'Bounce rate',
  'overview.sessionTime': 'Session time',
  'overview.revPerVisitor': 'Revenue / visitor',
  'overview.customers': 'customers',
  'overview.sessionsPerVisitor': 'sessions/visitor',

  'content.title': 'Content & campaigns',
  'content.subtitle': 'Every visit, traced back to the post, video, reel or page that produced it.',
  'content.peak': 'Traffic spike',
  'content.peakBody': '{day} brought {visitors} visitors, {lift} above a normal day.',
  'content.drivers': 'What drove it',
  'content.empty': 'Tag your links with ?ref= or ?utm_content= and the exact post shows up here.',
  'content.unlinked': 'Untagged traffic',
  'content.view': 'Open post',

  'realtime.title': 'Live',
  'realtime.liveNow': 'visitors on {domain} right now',
  'realtime.activity': 'Activity',
  'realtime.pages': 'Active pages',
  'realtime.sources': 'Sources',
  'realtime.countries': 'Countries',
  'realtime.globe': 'Live map',
  'realtime.globeHint': 'Drag to spin. Every dot is a visitor from the last 30 minutes.',
  'realtime.hideGlobe': 'Hide map',
  'realtime.showGlobe': 'Show map',

  'language.label': 'Language',
  'language.hint': 'Applies to this browser only.',
};

const es: Dict = {
  'nav.overview': 'Resumen', 'nav.realtime': 'En vivo', 'nav.content': 'Contenido', 'nav.audience': 'Audiencia',
  'nav.goals': 'Objetivos y embudos', 'nav.settings': 'Ajustes', 'nav.sites': 'Sitios', 'nav.agents': 'Agentes',
  'common.visitors': 'Visitantes', 'common.revenue': 'Ingresos', 'common.sales': 'Ventas', 'common.online': 'En línea ahora',
  'common.conversion': 'Conversión', 'common.direct': 'Directo', 'common.none': 'Aún nada', 'common.learnMore': 'Saber más',
  'sites.title': 'Sitios', 'sites.add': 'Añadir sitio', 'sites.all': 'Todos los sitios', 'sites.sort': 'Ordenar',
  'sites.sort.online': 'En línea ahora', 'sites.sort.revenue': 'Ingresos', 'sites.sort.visitors': 'Visitantes', 'sites.sort.name': 'Nombre',
  'sites.period7': '7 días', 'sites.period30': '30 días', 'sites.avgOrder': 'Pedido medio',
  'sites.sitesOnline': 'de {n} sitios en línea', 'sites.visitorsToday': 'Visitantes hoy', 'sites.revenueWindow': 'Ingresos ({days}d)',
  'sites.empty': 'Todavía no hay sitios', 'sites.emptyHint': 'Añade tu dominio para obtener el script de seguimiento y ver tráfico e ingresos en un minuto.',
  'overview.title': 'Resumen', 'overview.chart': 'Visitantes e ingresos', 'overview.new': 'nuevos', 'overview.returning': 'recurrentes',
  'overview.vsPrevious': 'vs periodo anterior', 'overview.last5': 'últimos 5 minutos', 'overview.bounce': 'Rebote',
  'overview.sessionTime': 'Duración', 'overview.revPerVisitor': 'Ingresos / visitante', 'overview.customers': 'clientes',
  'overview.sessionsPerVisitor': 'sesiones/visitante',
  'content.title': 'Contenido y campañas', 'content.subtitle': 'Cada visita, atribuida al post, vídeo, reel o página que la produjo.',
  'content.peak': 'Pico de tráfico', 'content.peakBody': '{day} trajo {visitors} visitantes, {lift} por encima de un día normal.',
  'content.drivers': 'Qué lo impulsó', 'content.empty': 'Etiqueta tus enlaces con ?ref= o ?utm_content= y el post exacto aparecerá aquí.',
  'content.unlinked': 'Tráfico sin etiquetar', 'content.view': 'Abrir post',
  'realtime.title': 'En vivo', 'realtime.liveNow': 'visitantes en {domain} ahora', 'realtime.activity': 'Actividad',
  'realtime.pages': 'Páginas activas', 'realtime.sources': 'Fuentes', 'realtime.countries': 'Países',
  'realtime.globe': 'Mapa en vivo', 'realtime.globeHint': 'Arrastra para girar. Cada punto es un visitante de los últimos 30 minutos.',
  'realtime.hideGlobe': 'Ocultar mapa', 'realtime.showGlobe': 'Mostrar mapa',
  'language.label': 'Idioma', 'language.hint': 'Solo se aplica a este navegador.',
};

const de: Dict = {
  'nav.overview': 'Übersicht', 'nav.realtime': 'Live', 'nav.content': 'Inhalte', 'nav.audience': 'Zielgruppe',
  'nav.goals': 'Ziele & Funnels', 'nav.settings': 'Einstellungen', 'nav.sites': 'Websites', 'nav.agents': 'Agenten',
  'common.visitors': 'Besucher', 'common.revenue': 'Umsatz', 'common.sales': 'Verkäufe', 'common.online': 'Jetzt online',
  'common.conversion': 'Conversion', 'common.direct': 'Direkt', 'common.none': 'Noch nichts', 'common.learnMore': 'Mehr erfahren',
  'sites.title': 'Websites', 'sites.add': 'Website hinzufügen', 'sites.all': 'Alle Websites', 'sites.sort': 'Sortieren',
  'sites.sort.online': 'Jetzt online', 'sites.sort.revenue': 'Umsatz', 'sites.sort.visitors': 'Besucher', 'sites.sort.name': 'Name',
  'sites.period7': '7 Tage', 'sites.period30': '30 Tage', 'sites.avgOrder': 'Ø Bestellung',
  'sites.sitesOnline': 'von {n} Websites online', 'sites.visitorsToday': 'Besucher heute', 'sites.revenueWindow': 'Umsatz ({days} T.)',
  'sites.empty': 'Noch keine Websites', 'sites.emptyHint': 'Füge deine Domain hinzu und erhalte in einer Minute einen Tracking-Snippet, Traffic und Umsatz.',
  'overview.title': 'Übersicht', 'overview.chart': 'Besucher & Umsatz', 'overview.new': 'neu', 'overview.returning': 'wiederkehrend',
  'overview.vsPrevious': 'vs. Vorperiode', 'overview.last5': 'letzte 5 Minuten', 'overview.bounce': 'Absprungrate',
  'overview.sessionTime': 'Sitzungsdauer', 'overview.revPerVisitor': 'Umsatz / Besucher', 'overview.customers': 'Kunden',
  'overview.sessionsPerVisitor': 'Sitzungen/Besucher',
  'content.title': 'Inhalte & Kampagnen', 'content.subtitle': 'Jeder Besuch, zurückgeführt auf den Post, das Video, das Reel oder die Seite.',
  'content.peak': 'Traffic-Spitze', 'content.peakBody': '{day} brachte {visitors} Besucher, {lift} über einem normalen Tag.',
  'content.drivers': 'Was es ausgelöst hat', 'content.empty': 'Tagge Links mit ?ref= oder ?utm_content=, dann erscheint der genaue Post hier.',
  'content.unlinked': 'Nicht getaggter Traffic', 'content.view': 'Post öffnen',
  'realtime.title': 'Live', 'realtime.liveNow': 'Besucher auf {domain} gerade', 'realtime.activity': 'Aktivität',
  'realtime.pages': 'Aktive Seiten', 'realtime.sources': 'Quellen', 'realtime.countries': 'Länder',
  'realtime.globe': 'Live-Karte', 'realtime.globeHint': 'Ziehen zum Drehen. Jeder Punkt ist ein Besucher der letzten 30 Minuten.',
  'realtime.hideGlobe': 'Karte ausblenden', 'realtime.showGlobe': 'Karte zeigen',
  'language.label': 'Sprache', 'language.hint': 'Gilt nur für diesen Browser.',
};

const fr: Dict = {
  'nav.overview': 'Vue d’ensemble', 'nav.realtime': 'En direct', 'nav.content': 'Contenus', 'nav.audience': 'Audience',
  'nav.goals': 'Objectifs et entonnoirs', 'nav.settings': 'Réglages', 'nav.sites': 'Sites', 'nav.agents': 'Agents',
  'common.visitors': 'Visiteurs', 'common.revenue': 'Revenus', 'common.sales': 'Ventes', 'common.online': 'En ligne',
  'common.conversion': 'Conversion', 'common.direct': 'Direct', 'common.none': 'Rien pour le moment', 'common.learnMore': 'En savoir plus',
  'sites.title': 'Sites', 'sites.add': 'Ajouter un site', 'sites.all': 'Tous les sites', 'sites.sort': 'Trier',
  'sites.sort.online': 'En ligne', 'sites.sort.revenue': 'Revenus', 'sites.sort.visitors': 'Visiteurs', 'sites.sort.name': 'Nom',
  'sites.period7': '7 jours', 'sites.period30': '30 jours', 'sites.avgOrder': 'Panier moyen',
  'sites.sitesOnline': 'sur {n} sites en ligne', 'sites.visitorsToday': 'Visiteurs aujourd’hui', 'sites.revenueWindow': 'Revenus ({days} j)',
  'sites.empty': 'Aucun site', 'sites.emptyHint': 'Ajoutez votre domaine pour obtenir le script de suivi et voir le trafic et les revenus en une minute.',
  'overview.title': 'Vue d’ensemble', 'overview.chart': 'Visiteurs et revenus', 'overview.new': 'nouveaux', 'overview.returning': 'de retour',
  'overview.vsPrevious': 'vs période précédente', 'overview.last5': '5 dernières minutes', 'overview.bounce': 'Rebond',
  'overview.sessionTime': 'Durée', 'overview.revPerVisitor': 'Revenus / visiteur', 'overview.customers': 'clients',
  'overview.sessionsPerVisitor': 'sessions/visiteur',
  'content.title': 'Contenus et campagnes', 'content.subtitle': 'Chaque visite, reliée au post, à la vidéo, au reel ou à la page qui l’a produite.',
  'content.peak': 'Pic de trafic', 'content.peakBody': '{day} a apporté {visitors} visiteurs, {lift} au-dessus d’un jour normal.',
  'content.drivers': 'Ce qui l’a causé', 'content.empty': 'Taguez vos liens avec ?ref= ou ?utm_content= et le post exact apparaîtra ici.',
  'content.unlinked': 'Trafic non tagué', 'content.view': 'Ouvrir le post',
  'realtime.title': 'En direct', 'realtime.liveNow': 'visiteurs sur {domain} maintenant', 'realtime.activity': 'Activité',
  'realtime.pages': 'Pages actives', 'realtime.sources': 'Sources', 'realtime.countries': 'Pays',
  'realtime.globe': 'Carte en direct', 'realtime.globeHint': 'Faites glisser pour tourner. Chaque point est un visiteur des 30 dernières minutes.',
  'realtime.hideGlobe': 'Masquer la carte', 'realtime.showGlobe': 'Afficher la carte',
  'language.label': 'Langue', 'language.hint': 'S’applique uniquement à ce navigateur.',
};

const pt: Dict = {
  'nav.overview': 'Visão geral', 'nav.realtime': 'Ao vivo', 'nav.content': 'Conteúdo', 'nav.audience': 'Audiência',
  'nav.goals': 'Metas e funis', 'nav.settings': 'Configurações', 'nav.sites': 'Sites', 'nav.agents': 'Agentes',
  'common.visitors': 'Visitantes', 'common.revenue': 'Receita', 'common.sales': 'Vendas', 'common.online': 'Online agora',
  'common.conversion': 'Conversão', 'common.direct': 'Direto', 'common.none': 'Nada ainda', 'common.learnMore': 'Saiba mais',
  'sites.title': 'Sites', 'sites.add': 'Adicionar site', 'sites.all': 'Todos os sites', 'sites.sort': 'Ordenar',
  'sites.sort.online': 'Online agora', 'sites.sort.revenue': 'Receita', 'sites.sort.visitors': 'Visitantes', 'sites.sort.name': 'Nome',
  'sites.period7': '7 dias', 'sites.period30': '30 dias', 'sites.avgOrder': 'Pedido médio',
  'sites.sitesOnline': 'de {n} sites online', 'sites.visitorsToday': 'Visitantes hoje', 'sites.revenueWindow': 'Receita ({days}d)',
  'sites.empty': 'Nenhum site ainda', 'sites.emptyHint': 'Adicione seu domínio para receber o script de rastreamento e ver tráfego e receita em um minuto.',
  'overview.title': 'Visão geral', 'overview.chart': 'Visitantes e receita', 'overview.new': 'novos', 'overview.returning': 'recorrentes',
  'overview.vsPrevious': 'vs período anterior', 'overview.last5': 'últimos 5 minutos', 'overview.bounce': 'Rejeição',
  'overview.sessionTime': 'Duração', 'overview.revPerVisitor': 'Receita / visitante', 'overview.customers': 'clientes',
  'overview.sessionsPerVisitor': 'sessões/visitante',
  'content.title': 'Conteúdo e campanhas', 'content.subtitle': 'Cada visita, ligada ao post, vídeo, reel ou página que a gerou.',
  'content.peak': 'Pico de tráfego', 'content.peakBody': '{day} trouxe {visitors} visitantes, {lift} acima de um dia normal.',
  'content.drivers': 'O que causou', 'content.empty': 'Marque seus links com ?ref= ou ?utm_content= e o post exato aparecerá aqui.',
  'content.unlinked': 'Tráfego sem marcação', 'content.view': 'Abrir post',
  'realtime.title': 'Ao vivo', 'realtime.liveNow': 'visitantes em {domain} agora', 'realtime.activity': 'Atividade',
  'realtime.pages': 'Páginas ativas', 'realtime.sources': 'Fontes', 'realtime.countries': 'Países',
  'realtime.globe': 'Mapa ao vivo', 'realtime.globeHint': 'Arraste para girar. Cada ponto é um visitante dos últimos 30 minutos.',
  'realtime.hideGlobe': 'Ocultar mapa', 'realtime.showGlobe': 'Mostrar mapa',
  'language.label': 'Idioma', 'language.hint': 'Aplica-se apenas a este navegador.',
};

const hi: Dict = {
  'nav.overview': 'अवलोकन', 'nav.realtime': 'लाइव', 'nav.content': 'कंटेंट', 'nav.audience': 'दर्शक',
  'nav.goals': 'लक्ष्य और फ़नल', 'nav.settings': 'सेटिंग्स', 'nav.sites': 'वेबसाइट्स', 'nav.agents': 'एजेंट्स',
  'common.visitors': 'विज़िटर', 'common.revenue': 'राजस्व', 'common.sales': 'बिक्री', 'common.online': 'अभी ऑनलाइन',
  'common.conversion': 'कन्वर्ज़न', 'common.direct': 'डायरेक्ट', 'common.none': 'अभी कुछ नहीं', 'common.learnMore': 'और जानें',
  'sites.title': 'वेबसाइट्स', 'sites.add': 'वेबसाइट जोड़ें', 'sites.all': 'सभी वेबसाइट्स', 'sites.sort': 'क्रम',
  'sites.sort.online': 'अभी ऑनलाइन', 'sites.sort.revenue': 'राजस्व', 'sites.sort.visitors': 'विज़िटर', 'sites.sort.name': 'नाम',
  'sites.period7': '7 दिन', 'sites.period30': '30 दिन', 'sites.avgOrder': 'औसत ऑर्डर',
  'sites.sitesOnline': '{n} में से ऑनलाइन', 'sites.visitorsToday': 'आज के विज़िटर', 'sites.revenueWindow': 'राजस्व ({days} दिन)',
  'sites.empty': 'अभी कोई वेबसाइट नहीं', 'sites.emptyHint': 'अपना डोमेन जोड़ें और एक मिनट में ट्रैफ़िक व राजस्व देखें.',
  'overview.title': 'अवलोकन', 'overview.chart': 'विज़िटर और राजस्व', 'overview.new': 'नए', 'overview.returning': 'वापस आए',
  'overview.vsPrevious': 'पिछली अवधि से', 'overview.last5': 'पिछले 5 मिनट', 'overview.bounce': 'बाउंस दर',
  'overview.sessionTime': 'सेशन समय', 'overview.revPerVisitor': 'राजस्व / विज़िटर', 'overview.customers': 'ग्राहक',
  'overview.sessionsPerVisitor': 'सेशन/विज़िटर',
  'content.title': 'कंटेंट और कैंपेन', 'content.subtitle': 'हर विज़िट उस पोस्ट, वीडियो, रील या पेज से जुड़ी.',
  'content.peak': 'ट्रैफ़िक स्पाइक', 'content.peakBody': '{day} पर {visitors} विज़िटर आए, सामान्य दिन से {lift} ज़्यादा.',
  'content.drivers': 'इसका कारण', 'content.empty': 'लिंक पर ?ref= या ?utm_content= लगाएँ, फिर सटीक पोस्ट यहाँ दिखेगा.',
  'content.unlinked': 'बिना टैग ट्रैफ़िक', 'content.view': 'पोस्ट खोलें',
  'realtime.title': 'लाइव', 'realtime.liveNow': '{domain} पर अभी विज़िटर', 'realtime.activity': 'गतिविधि',
  'realtime.pages': 'सक्रिय पेज', 'realtime.sources': 'स्रोत', 'realtime.countries': 'देश',
  'realtime.globe': 'लाइव मैप', 'realtime.globeHint': 'घुमाने के लिए खींचें. हर बिंदु पिछले 30 मिनट का विज़िटर है.',
  'realtime.hideGlobe': 'मैप छिपाएँ', 'realtime.showGlobe': 'मैप दिखाएँ',
  'language.label': 'भाषा', 'language.hint': 'केवल इस ब्राउज़र पर लागू.',
};

const ja: Dict = {
  'nav.overview': '概要', 'nav.realtime': 'ライブ', 'nav.content': 'コンテンツ', 'nav.audience': 'オーディエンス',
  'nav.goals': 'ゴールとファネル', 'nav.settings': '設定', 'nav.sites': 'サイト', 'nav.agents': 'エージェント',
  'common.visitors': '訪問者', 'common.revenue': '売上', 'common.sales': '販売数', 'common.online': '現在オンライン',
  'common.conversion': 'コンバージョン', 'common.direct': '直接', 'common.none': 'まだありません', 'common.learnMore': '詳細',
  'sites.title': 'サイト', 'sites.add': 'サイトを追加', 'sites.all': 'すべてのサイト', 'sites.sort': '並び替え',
  'sites.sort.online': 'オンライン順', 'sites.sort.revenue': '売上順', 'sites.sort.visitors': '訪問者順', 'sites.sort.name': '名前順',
  'sites.period7': '7日間', 'sites.period30': '30日間', 'sites.avgOrder': '平均注文額',
  'sites.sitesOnline': '{n} サイト中オンライン', 'sites.visitorsToday': '今日の訪問者', 'sites.revenueWindow': '売上（{days}日）',
  'sites.empty': 'サイトがありません', 'sites.emptyHint': 'ドメインを追加すると、1分でトラッキングタグとトラフィック・売上が表示されます。',
  'overview.title': '概要', 'overview.chart': '訪問者と売上', 'overview.new': '新規', 'overview.returning': '再来',
  'overview.vsPrevious': '前期間比', 'overview.last5': '過去5分', 'overview.bounce': '直帰率',
  'overview.sessionTime': '滞在時間', 'overview.revPerVisitor': '売上 / 訪問者', 'overview.customers': '顧客',
  'overview.sessionsPerVisitor': 'セッション/訪問者',
  'content.title': 'コンテンツとキャンペーン', 'content.subtitle': 'すべての訪問を、流入元の投稿・動画・リール・ページまで遡ります。',
  'content.peak': 'トラフィック急増', 'content.peakBody': '{day} は {visitors} 人の訪問者、通常日の {lift} 増。',
  'content.drivers': '原因', 'content.empty': 'リンクに ?ref= か ?utm_content= を付けると、その投稿がここに表示されます。',
  'content.unlinked': 'タグなしトラフィック', 'content.view': '投稿を開く',
  'realtime.title': 'ライブ', 'realtime.liveNow': '{domain} の現在の訪問者', 'realtime.activity': 'アクティビティ',
  'realtime.pages': 'アクティブページ', 'realtime.sources': '参照元', 'realtime.countries': '国',
  'realtime.globe': 'ライブマップ', 'realtime.globeHint': 'ドラッグで回転。各点は過去30分の訪問者です。',
  'realtime.hideGlobe': 'マップを隠す', 'realtime.showGlobe': 'マップを表示',
  'language.label': '言語', 'language.hint': 'このブラウザのみに適用されます。',
};

const zh: Dict = {
  'nav.overview': '概览', 'nav.realtime': '实时', 'nav.content': '内容', 'nav.audience': '受众',
  'nav.goals': '目标与漏斗', 'nav.settings': '设置', 'nav.sites': '站点', 'nav.agents': '智能体',
  'common.visitors': '访客', 'common.revenue': '收入', 'common.sales': '订单', 'common.online': '当前在线',
  'common.conversion': '转化率', 'common.direct': '直接访问', 'common.none': '暂无数据', 'common.learnMore': '了解更多',
  'sites.title': '站点', 'sites.add': '添加站点', 'sites.all': '全部站点', 'sites.sort': '排序',
  'sites.sort.online': '当前在线', 'sites.sort.revenue': '收入', 'sites.sort.visitors': '访客', 'sites.sort.name': '名称',
  'sites.period7': '7 天', 'sites.period30': '30 天', 'sites.avgOrder': '平均客单价',
  'sites.sitesOnline': '{n} 个站点在线', 'sites.visitorsToday': '今日访客', 'sites.revenueWindow': '收入（{days} 天）',
  'sites.empty': '还没有站点', 'sites.emptyHint': '添加域名，即可获得一行追踪代码，一分钟内看到流量与收入。',
  'overview.title': '概览', 'overview.chart': '访客与收入', 'overview.new': '新访客', 'overview.returning': '回访',
  'overview.vsPrevious': '较上一周期', 'overview.last5': '最近 5 分钟', 'overview.bounce': '跳出率',
  'overview.sessionTime': '会话时长', 'overview.revPerVisitor': '每访客收入', 'overview.customers': '客户',
  'overview.sessionsPerVisitor': '会话/访客',
  'content.title': '内容与活动', 'content.subtitle': '每一次访问，都追溯到带来它的帖子、视频、Reels 或页面。',
  'content.peak': '流量高峰', 'content.peakBody': '{day} 带来 {visitors} 位访客，比平常高 {lift}。',
  'content.drivers': '推动因素', 'content.empty': '在链接上添加 ?ref= 或 ?utm_content=，具体帖子就会显示在这里。',
  'content.unlinked': '未标记流量', 'content.view': '打开帖子',
  'realtime.title': '实时', 'realtime.liveNow': '{domain} 当前的访客', 'realtime.activity': '动态',
  'realtime.pages': '活跃页面', 'realtime.sources': '来源', 'realtime.countries': '国家',
  'realtime.globe': '实时地图', 'realtime.globeHint': '拖动旋转。每个点代表过去 30 分钟内的一位访客。',
  'realtime.hideGlobe': '隐藏地图', 'realtime.showGlobe': '显示地图',
  'language.label': '语言', 'language.hint': '仅对此浏览器生效。',
};

const DICTS: Record<Locale, Dict> = { en, es, de, fr, pt, hi, ja, zh };

const STORAGE = 'kt_lang';
const listeners = new Set<(l: Locale) => void>();

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE) as Locale | null;
    if (saved && DICTS[saved]) return saved;
  } catch {}
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  const base = nav.split('-')[0] as Locale;
  return DICTS[base] ? base : 'en';
}

export function getLocale(): Locale {
  return detect();
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE, locale);
  } catch {}
  document.documentElement.lang = locale;
  listeners.forEach((fn) => fn(locale));
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const value = DICTS[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

/** Subscribe components to the current language. */
export function useT() {
  const [locale, set] = useState<Locale>(detect);
  useEffect(() => {
    const fn = (l: Locale) => set(l);
    listeners.add(fn);
    document.documentElement.lang = locale;
    return () => {
      listeners.delete(fn);
    };
  }, [locale]);
  return {
    locale,
    setLocale,
    t: (key: string, vars?: Record<string, string | number>) => t(locale, key, vars),
  };
}
