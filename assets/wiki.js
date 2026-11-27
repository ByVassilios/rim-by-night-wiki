// Marks the open page in the side list.
const here = location.href.split('#')[0].replace(/index\.html$/, '');
for (const a of document.querySelectorAll('.side a'))
  if (a.href.replace(/index\.html$/, '') === here) a.classList.add('here');

// Each cell learns its column's name, so a phone can show a table row as a card.
for (const table of document.querySelectorAll('.page table')) {
  const names = [...table.querySelectorAll('th')].map(th => th.textContent.trim());
  if (names.length < 3) continue;
  table.classList.add('cards');
  for (const tr of table.querySelectorAll('tbody tr'))
    [...tr.children].forEach((td, i) => {
      if (!td.textContent.trim() && !td.querySelector('img')) td.classList.add('blank');
      else if (names[i]) td.dataset.label = names[i];
    });
}

// On this page: the page's h2 headings, the one being read lit as you scroll.
const headings = [...document.querySelectorAll('.page h2[id]')];
const toc = document.querySelector('.toc');
if (headings.length >= 3) {
  for (const h of headings) {
    const a = document.createElement('a');
    a.href = '#' + h.id; a.textContent = h.textContent;
    toc.append(a);
  }
  toc.hidden = false;
  const links = toc.querySelectorAll('a');
  const light = () => {
    let on = 0;
    headings.forEach((h, i) => { if (h.getBoundingClientRect().top < innerHeight / 2) on = i; });
    links.forEach((a, i) => a.classList.toggle('here', i === on));
  };
  addEventListener('scroll', light, { passive: true });
  light();
}

// The page shows curly quotes where the index has straight ones, and phones type curly ones.
const plain = s => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase();

// A search result opens its page at #find=Name&q=words. The words are marked everywhere on the page, and it
// scrolls to the first mark at or after the heading or table row called Name, or flashes that when no word is in it.
const marksBar = document.createElement('div');
marksBar.className = 'marks-bar'; marksBar.hidden = true;
marksBar.innerHTML = '<span></span><button aria-label="Previous match">↑</button><button aria-label="Next match">↓</button><button aria-label="Clear the marks">✕</button>';
document.body.append(marksBar);
let marks = [], markAt = 0;

function showMark(i) {
  markAt = (i + marks.length) % marks.length;
  marks.forEach((m, j) => m.classList.toggle('now', j === markAt));
  marks[markAt].scrollIntoView({ block: 'center' });
  marksBar.firstChild.textContent = `${markAt + 1} of ${marks.length}: “${marks[markAt].textContent}”`;
}
function clearMarks() {
  for (const m of marks) m.replaceWith(...m.childNodes);
  document.querySelector('.page')?.normalize();
  marks = []; marksBar.hidden = true;
}
const [prevButton, nextButton, clearButton] = marksBar.querySelectorAll('button');
prevButton.onclick = () => showMark(markAt - 1);
nextButton.onclick = () => showMark(markAt + 1);
clearButton.onclick = clearMarks;

// The whole phrase if the page has it, else each word of three letters or more. ' and ’ match each other.
function markWords(q) {
  const page = document.querySelector('.page');
  const text = plain(page.textContent), words = plain(q).split(/\s+/);
  const parts = text.includes(words.join(' ')) ? [words.join(' ')] : words.filter(w => w.length > 2);
  if (!parts.length) return;
  const re = new RegExp(parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")).join('|'), 'gi');
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (re.test(walker.currentNode.data)) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const span = document.createElement('span');
    span.innerHTML = esc(node.data).replace(re, '<mark class="hl">$&</mark>');
    node.replaceWith(...span.childNodes);
  }
  marks = [...page.querySelectorAll('mark.hl')];
}

function findOnPage() {
  const args = new URLSearchParams(location.hash.slice(1));
  if (!args.has('find') && !args.has('q')) return;
  clearMarks();
  if (args.get('q')) markWords(args.get('q'));
  let target = null;
  const name = plain(args.get('find') || '');
  if (name)
    for (const el of document.querySelectorAll('.page h1, .page h2, .page h3, .page h4, .page td strong'))
      if (plain(el.textContent) === name) { target = el.closest('tr') || el; break; }
  const first = target ? marks.findIndex(m => target.contains(m) || target.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) : 0;
  if (marks.length) { marksBar.hidden = false; showMark(Math.max(first, 0)); }
  if (target && !(marks.length && first >= 0 && target.contains(marks[first]))) {
    if (!marks.length || first < 0) target.scrollIntoView({ block: 'center' });
    target.classList.remove('found'); void target.offsetWidth; target.classList.add('found');
  }
}
addEventListener('hashchange', findOnPage);

// Search: the index loads the first time the box is used.
const box = document.getElementById('q'), hits = document.getElementById('hits');
const mods = { core: 'Core', kindred: 'Kindred', garou: 'Garou', imbued: 'Imbued', awakened: 'Awakened', fera: 'Fera' };
let index = null, picked = 0;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pattern = words => new RegExp(words.map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
const mark = (s, words) => esc(s).replace(pattern(words), '<u>$&</u>');
const snippet = (s, words) => {
  const i = Math.max(0, plain(s).indexOf(words.find(w => plain(s).includes(w))));
  const from = Math.max(0, i - 40), to = i + 100;
  return (from ? '…' : '') + mark(s.slice(from, to), words) + (to < s.length ? '…' : '');
};

async function search() {
  const q = plain(box.value);
  if (!q) { close(); return; }
  if (!index) index = await (await fetch(wikiRoot + 'assets/search.json?v=' + wikiBuild)).json();
  if (plain(box.value) !== q) return;
  const words = q.split(/\s+/);
  // The name said exactly beats a name that starts with it, then one with a word that starts with it, then one
  // holding every word anywhere, then a row whose text holds them. On a tie a page beats a section beats a row,
  // and the Reference lists come last, as they repeat what the other pages say.
  const scored = [];
  for (const e of index) {
    const name = plain(e[0]), text = name + ' ' + plain(e[5]);
    const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(' ' + q) ? 2
      : words.every(w => name.includes(w)) ? 3 : words.every(w => text.includes(w)) ? 5 : -1;
    if (score < 0) continue;
    const kind = !e[2] ? 0 : e[6] ? .2 : .1;
    scored.push([score + kind + (e[3].includes('/Reference-') ? .5 : 0), e]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  // A power or item shows once, from its best page; a heading once per page.
  const seen = new Set(), found = [];
  for (const [, e] of scored) {
    const key = e[6] ? plain(e[0]) + '|' + e[1] : e[3] + '|' + e[0];
    if (!seen.has(key)) { seen.add(key); found.push(e); }
  }
  picked = 0;
  const row = e => `<a class="hit" role="option" href="${wikiRoot}${e[3]}#${e[2] ? 'find=' + encodeURIComponent(e[0]) + '&' : ''}q=${encodeURIComponent(box.value.trim())}">
    <b>${mark(e[0], words)}</b> <span class="tag ${e[1]}">${mods[e[1]]}</span>
    <small>${esc([e[2], e[4]].filter(Boolean).join(' · ') || 'Page')}</small>
    ${e[5] && !words.every(w => plain(e[0]).includes(w)) ? `<small>${snippet(e[5], words)}</small>` : ''}</a>`;
  hits.innerHTML = (found.length ? found.slice(0, 12).map(row).join('') : `<p class="none">Nothing found for “${esc(box.value)}”.</p>`)
    + (found.length > 12 ? `<p class="none">${found.length - 12} more: type more to narrow it.</p>` : '')
    + '<p class="keys">↑↓ to move · Enter to open · Esc to close</p>';
  hits.hidden = false; box.setAttribute('aria-expanded', 'true');
  light();
}
function light() { hits.querySelectorAll('.hit').forEach((a, i) => a.classList.toggle('on', i === picked)); }
function close() { hits.hidden = true; box.setAttribute('aria-expanded', 'false'); }

box.addEventListener('input', search);
// A result on the page already open has the same url, so no hashchange: find it by hand.
hits.addEventListener('click', () => { close(); setTimeout(findOnPage); });
box.addEventListener('focus', () => { if (box.value.trim()) search(); });
box.addEventListener('keydown', e => {
  const links = hits.querySelectorAll('.hit');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    picked = (picked + (e.key === 'ArrowDown' ? 1 : links.length - 1)) % (links.length || 1);
    light(); links[picked]?.scrollIntoView({ block: 'nearest' }); e.preventDefault();
  } else if (e.key === 'Enter' && links[picked]) {
    links[picked].click();
  } else if (e.key === 'Escape') {
    close(); box.blur(); document.body.classList.remove('searching');
  }
});
// The search box stays open while you click a result; a click anywhere else closes it.
document.addEventListener('click', e => { if (!e.target.closest('.search, .search-button')) close(); });
// Press / anywhere to search.
addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault(); document.body.classList.add('searching'); box.focus();
  }
});

// Last, as it needs esc from the search code above.
findOnPage();
