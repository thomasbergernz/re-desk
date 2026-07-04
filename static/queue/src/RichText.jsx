import React from 'react';
import { router } from '@forge/bridge';

// Matches http(s) URLs, optionally wrapped in the <https://…> style that
// email-to-Jira conversion produces.
const URL_RE = /<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>]+)/g;

// Longest link label we render; anything longer is elided. Long enough to
// recognise the destination, short enough that a tracking URL can't flood
// the pane.
const MAX_LABEL = 60;

// Sentence punctuation glued to the end of a bare URL is almost never part
// of it ("see https://example.com."), so peel it off before linking.
function splitTrailingPunctuation(url) {
  const match = url.match(/[.,;:!?'")\]]+$/);
  if (!match) return [url, ''];
  return [url.slice(0, -match[0].length), match[0]];
}

function shorten(url) {
  let label = url;
  try {
    const u = new URL(url);
    label = `${u.host}${u.pathname}${u.search}${u.hash}`;
  } catch {
    // Leave the raw string; the regex already guaranteed an http(s) prefix.
  }
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL)}…` : label;
}

/**
 * Plain text with URLs collapsed into short clickable links, so email-origin
 * tickets full of tracking URLs stay readable. The full URL stays available
 * on hover; clicks open a new tab via the Forge router (required inside the
 * Custom UI iframe sandbox).
 */
const RichText = ({ text }) => {
  if (!text) return null;

  const parts = [];
  let last = 0;
  let match;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    // match[1] is an <angle-wrapped> URL (punctuation is part of it),
    // match[2] a bare one that may have sentence punctuation stuck on.
    const [url, trailing] = match[1]
      ? [match[1], '']
      : splitTrailingPunctuation(match[2]);
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <a
        key={match.index}
        href={url}
        title={url}
        className="body-link"
        onClick={(e) => {
          e.preventDefault();
          router.open(url);
        }}
      >
        {shorten(url)}
      </a>
    );
    if (trailing) parts.push(trailing);
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return <>{parts}</>;
};

export default RichText;
