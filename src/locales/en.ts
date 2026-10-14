/**
 * English UI strings.
 *
 * Typed as `Messages`, i.e. `Record<keyof typeof zhCN, string>`, so a key added to the Chinese
 * catalogue without an English counterpart fails the type check.
 *
 * The English wording is written for the space it has to fit, not translated word by word.
 */
import type { Messages } from './zh-CN';

export const en: Messages = {
  'app.name': 'TextCount',
  'app.tagline': 'Local-first text counting',

  'topbar.language': 'Language',
  'topbar.theme': 'Theme',
  'topbar.theme.system': 'System',
  'topbar.theme.light': 'Light',
  'topbar.theme.dark': 'Dark',
  'topbar.theme.systemShort': 'Auto',
  'topbar.theme.lightShort': 'Light',
  'topbar.theme.darkShort': 'Dark',
  'topbar.about': 'About',

  'headline.primary.mixed': 'Words',
  'headline.primary.han': 'Han characters',
  'headline.primary.latinWords': 'English words',
  'headline.primary.charsNoSpace': 'Characters without spaces',
  'headline.graphemes': 'Characters',
  'headline.graphemesNote': 'including spaces',

  'tool.stats': 'Statistics',
  'tool.search': 'Find',
  'tool.symbols': 'Punctuation',

  'stats.detail': 'Details',
  'stats.metric.han': 'Han characters',
  'stats.metric.kana': 'Kana',
  'stats.metric.latinWords': 'English words',
  'stats.metric.digitRuns': 'Number runs',
  'stats.metric.otherWords': 'Other scripts (words)',
  'stats.metric.punctuation': 'Punctuation marks',
  'stats.metric.graphemes': 'Characters (with spaces)',
  'stats.metric.whitespace': 'Whitespace characters',
  'stats.metric.lines': 'Lines',
  'stats.metric.paragraphs': 'Paragraphs',
  'stats.metric.utf16Length': 'UTF-16 length',
  'stats.rules.open': 'Counting rules',
  'stats.rules.close': 'Hide',
  'stats.rules.primary': 'Count the headline number as',
  'stats.rules.primary.mixed': 'Mixed Chinese/English words',
  'stats.rules.primary.han': 'Han characters only',
  'stats.rules.primary.latinWords': 'English words only',
  'stats.rules.primary.charsNoSpace': 'Characters without spaces',
  'stats.rules.digitRuns': 'Count a run of digits as one unit',
  'stats.rules.punctuation': 'Count every punctuation mark as one unit',
  'stats.rules.note': 'Changing the rules never edits or clears your text.',
  'stats.rules.options': 'Counted in the headline number',
  'stats.rules.explain.mixed':
    '1 per Han character + 1 per kana character + 1 per English word + 1 per run of digits (optional) + 1 per word in other scripts. Punctuation, whitespace and emoji are excluded by default.',
  'stats.rules.explain.han':
    'Counts code points whose Unicode script is Han, one each, including the extension and compatibility blocks.',
  'stats.rules.explain.latinWords':
    'Counts each run of Latin letters as one word; apostrophes and hyphens inside a word do not split it.',
  'stats.rules.explain.charsNoSpace':
    'Counts user-perceived characters (Unicode grapheme clusters) and excludes whitespace; an emoji, a flag or an accented letter counts once.',

  'editor.placeholder': 'Paste or type text to count it instantly',
  'editor.ariaLabel': 'Text input',
  'editor.clear': 'Clear',
  'editor.clearConfirm': 'Click again to clear',
  'editor.clearConfirmHint': 'This text is long, so clearing needs a second click.',
  'editor.copy': 'Copy all',
  'editor.copied': 'Copied',
  'editor.copyFailed': 'Copy failed',
  'editor.computing': 'Counting…',
  'editor.readonlyNotice': 'This is a long text. It is still counted in full; nothing is truncated.',
  'editor.degradedNotice':
    'Background counting is unavailable in this browser, so very long texts may pause briefly while counting. Results are still complete.',

  'search.placeholder': 'Type a character, word or phrase',
  'search.add': 'Add target',
  'search.caseSensitive': 'Match case',
  'search.hint': 'Matched literally against the original text: "," never matches "，".',
  'search.overlapHint': 'Non-overlapping: "aa" occurs twice in "aaaa".',
  'search.empty': 'Type something to find. Add several targets to check them at once.',
  'search.running': 'Searching…',
  'search.remove': 'Remove',
  'search.locate': 'Locate',
  'search.matchOne': '{n} match',
  'search.matchMany': '{n} matches',
  'search.noMatch': 'No match',
  'search.noMatchDetail': 'This target does not appear anywhere in the text.',
  'search.prev': 'Previous',
  'search.next': 'Next',
  'search.position': 'Match {index} of {total}',
  'search.truncated': 'Too many matches: only the first {kept} are kept for navigation. The total is {total}.',
  'search.noTerm': 'No search targets yet',

  'symbols.loading': 'Checking…',
  'symbols.empty': 'No punctuation found in this text.',
  'symbols.emptyText': 'Enter some text to check full-width/half-width and punctuation usage.',
  'symbols.categories': 'By category',
  'symbols.related': 'Related forms',
  'symbols.mixedBadge': 'More than one form',
  'symbols.singleBadge': 'One form only',
  'symbols.distinct': '{n} kinds',
  'symbols.locate': 'Locate',
  'symbols.note':
    'This only reports that more than one form exists — it is not an error. Mixing forms is often correct in mixed Chinese/English text; judge against your own style guide.',
  'symbols.total': 'Total marks',
  'symbols.category.ascii': 'ASCII punctuation',
  'symbols.category.fullwidth': 'Full-width punctuation',
  'symbols.category.cjk': 'Chinese/CJK punctuation',
  'symbols.category.other': 'Other symbols',

  'symbols.group.comma': 'Comma',
  'symbols.group.period': 'Full stop / period',
  'symbols.group.colon': 'Colon',
  'symbols.group.semicolon': 'Semicolon',
  'symbols.group.exclamation': 'Exclamation mark',
  'symbols.group.question': 'Question mark',
  'symbols.group.paren': 'Parentheses',
  'symbols.group.bracket': 'Square brackets',
  'symbols.group.brace': 'Braces',
  'symbols.group.angle': 'Angle brackets',
  'symbols.group.quote-double': 'Double quotes',
  'symbols.group.quote-single': 'Single quotes',
  'symbols.group.dash': 'Hyphen / dash',
  'symbols.group.ellipsis': 'Ellipsis',
  'symbols.group.tilde': 'Tilde',
  'symbols.group.slash': 'Slash',
  'symbols.group.backslash': 'Backslash',
  'symbols.group.pipe': 'Vertical bar',
  'symbols.group.at': 'At sign',
  'symbols.group.hash': 'Number sign',
  'symbols.group.dollar': 'Dollar sign',
  'symbols.group.percent': 'Percent sign',
  'symbols.group.ampersand': 'Ampersand',
  'symbols.group.asterisk': 'Asterisk',
  'symbols.group.plus': 'Plus sign',
  'symbols.group.equals': 'Equals sign',
  'symbols.group.underscore': 'Underscore',
  'symbols.group.caret': 'Caret',
  'symbols.group.backtick': 'Backtick',
  'symbols.group.middle-dot': 'Middle dot',
  'symbols.group.corner-bracket': 'Corner brackets',
  'symbols.group.book-title': 'Title marks',
  'symbols.group.lenticular': 'Lenticular brackets',

  'about.title': 'About TextCount',
  'about.close': 'Close',
  'about.privacy.title': 'Privacy',
  'about.privacy.body':
    'Your text is processed only in this browser. The page never sends it anywhere: no account, no ads, no analytics, no third-party fonts or runtime scripts. Reloading the page clears the text — that is the intended behaviour of this release.',
  'about.privacy.hosting':
    'The site itself is served by GitHub Pages, which may keep standard access logs. We do not claim the visit is anonymous; we do promise that the text you enter is never uploaded or collected.',
  'about.rules.title': 'Counting rules',
  'about.rules.body':
    '“Word count” is not one number. TextCount computes the common definitions separately instead of hiding them behind a single vague figure.',
  'about.rules.han':
    'Han characters: code points whose Unicode script is Han, one each, including the extension and compatibility blocks.',
  'about.rules.latin':
    'English words: one per run of Latin letters; apostrophes and hyphens inside a word do not split it.',
  'about.rules.digit':
    'Number runs: one per run of decimal digits; a single decimal point or thousands separator does not split it.',
  'about.rules.other':
    'Other scripts: one per space-separated word; kana count one each. Scripts written without spaces have a known limitation.',
  'about.rules.char':
    'Characters: user-perceived characters (Unicode grapheme clusters), which differ from the UTF-16 length.',
  'about.shortcuts.title': 'Keyboard',
  'about.shortcuts.body': 'Tab moves focus between the tool panels; Esc closes this dialog or the rules menu.',

  'footer.local': 'Your text stays on this device. It is processed locally.',
  'footer.hosting': 'The hosting platform may keep standard access logs.',

  'common.copy': 'Copy',
  'common.clear': 'Clear',
  'common.none': '—',
  'common.characters': 'characters',
};
