export const RESTRICTED_USERNAMES = [
  'admin', 'administrator', 'support', 'help', 'helpdesk', 'system', 'root', 'webmaster',
  'notifications', 'notification', 'official', 'verified', 'rejig', 'socialrejig', 'rejigapp',
  'api', 'dev', 'developer', 'developers', 'mod', 'moderator', 'staff', 'billing', 'sales',
  'error', 'warning', 'info', 'status', 'account', 'profile', 'settings', 'config',
  'login', 'signin', 'logout', 'signout', 'register', 'signup', 'auth', 'password',
  'security', 'privacy', 'terms', 'policy', 'legal', 'about', 'contact', 'search',
  'home', 'index', 'dashboard', 'feed', 'discovery', 'explore', 'trending', 'popular',
  'chat', 'messages', 'message', 'mail', 'email', 'inbox', 'outbox', 'spam', 'junk',
  'friends', 'followers', 'following', 'follow', 'unfollow', 'like', 'likes', 'love',
  'comment', 'comments', 'reply', 'replies', 'share', 'shares', 'repost', 'reposts',
  'post', 'posts', 'story', 'stories', 'media', 'images', 'image', 'photos', 'photo',
  'video', 'videos', 'music', 'audio', 'sound', 'sounds', 'game', 'games', 'quiz',
  'quizzes', 'play', 'player', 'players', 'gaming', 'esports', 'competition',
  'community', 'communities', 'group', 'groups', 'team', 'teams', 'club', 'clubs',
  'shop', 'store', 'market', 'marketplace', 'cart', 'checkout', 'pay', 'payment',
  'bank', 'wallet', 'crypto', 'coin', 'coins', 'token', 'tokens', 'reward', 'rewards',
  'gift', 'gifts', 'card', 'cards', 'credit', 'debit', 'promo', 'promotion', 'ads',
  'advertising', 'advertisement', 'sponsor', 'sponsored', 'partner', 'partnership',
  'affiliate', 'referral', 'invite', 'invitation', 'code', 'codes', 'download', 'app',
  'mobile', 'desktop', 'web', 'site', 'website', 'blog', 'news', 'update', 'updates',
  'version', 'beta', 'alpha', 'test', 'tester', 'testing', 'demo', 'example', 'sample',
  'void', 'null', 'undefined', 'nan', 'true', 'false', 'boolean', 'string', 'number',
  'object', 'array', 'function', 'class', 'const', 'let', 'var', 'global', 'window',
  'document', 'body', 'head', 'css', 'js', 'html', 'json', 'xml', 'localhost',
  'server', 'client', 'proxy', 'cache', 'database', 'db', 'sql', 'nosql', 'mongo',
  'redis', 'docker', 'cloud', 'aws', 'azure', 'google', 'apple', 'microsoft',
  'facebook', 'meta', 'instagram', 'twitter', 'x', 'tiktok', 'youtube', 'github',
  'gitlab', 'bitbucket', 'slack', 'discord', 'telegram', 'whatsapp', 'signal',
  'uber', 'lyft', 'zoom', 'spotify', 'netflix', 'amazon', 'ebay', 'paypal', 'stripe',
  'official_rejig', 'rejig_official', 'admin_rejig', 'rejig_admin', 'support_rejig',
  'rejig_support', 'help_rejig', 'rejig_help', 'system_rejig', 'rejig_system',
  'staff_rejig', 'rejig_staff', 'mod_rejig', 'rejig_mod', 'verified_rejig', 'rejig_verified'
];

/**
 * Checks if a username is natively restricted based on the architectural blacklist.
 */
export const isRestrictedUsername = (username: string): boolean => {
  const sanitized = username.toLowerCase().trim();
  return RESTRICTED_USERNAMES.includes(sanitized);
};
