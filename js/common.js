// Общие помощники и чистая логика (без обращения к DOM при загрузке).
(function (root) {
  'use strict';

  var App = root.App = root.App || {};
  App.modes = App.modes || {};

  // ---------- Случайность ----------
  App.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  App.sample = function (arr, n) {
    return App.shuffle(arr).slice(0, n);
  };

  // ---------- Подбор вариантов ----------
  function stems(text) {
    var set = {};
    String(text).toLowerCase().split(/[^а-яёa-z]+/i).forEach(function (w) {
      if (w.length >= 4) set[w.slice(0, 5)] = true;
    });
    return set;
  }

  // «Близкие по смыслу» определения: сначала та же тема (cat),
  // затем по пересечению слов, затем случайные.
  App.pickSimilarTerms = function (target, n) {
    var pool = root.TERMS.filter(function (t) {
      return t !== target && t.term !== target.term && t.def !== target.def;
    });
    var same = App.shuffle(pool.filter(function (t) { return t.cat === target.cat; }));
    var result = same.slice(0, n);
    if (result.length < n) {
      var targetStems = stems(target.def);
      var rest = App.shuffle(pool.filter(function (t) { return result.indexOf(t) === -1; }));
      var scored = rest.map(function (t) {
        var s = stems(t.def), score = 0;
        for (var k in s) if (targetStems[k]) score++;
        return { t: t, score: score };
      });
      scored.sort(function (a, b) { return b.score - a.score; }); // стабильная: ничья остаётся случайной
      scored.slice(0, n - result.length).forEach(function (x) { result.push(x.t); });
    }
    return result;
  };

  // События, ближайшие по времени и не пересекающиеся с целевым интервалом.
  App.pickNearEvents = function (target, n) {
    var tEnd = target.yearEnd != null ? target.yearEnd : target.year;
    var pool = root.EVENTS.filter(function (e) {
      if (e === target || e.text === target.text) return false;
      var eEnd = e.yearEnd != null ? e.yearEnd : e.year;
      return eEnd < target.year || e.year > tEnd; // интервалы не пересекаются
    });
    var seen = {};
    var shuffled = App.shuffle(pool).filter(function (e) {
      if (seen[e.text]) return false;
      seen[e.text] = true;
      return true;
    });
    function dist(e) {
      var eEnd = e.yearEnd != null ? e.yearEnd : e.year;
      return eEnd < target.year ? target.year - eEnd : e.year - tEnd;
    }
    shuffled.sort(function (a, b) { return dist(a) - dist(b); });
    return shuffled.slice(0, n);
  };

  // N случайных событий без приблизительных дат и с разными годами.
  App.pickOrderEvents = function (n) {
    var res = [], years = {};
    App.shuffle(root.EVENTS.filter(function (e) { return !e.approx; })).forEach(function (e) {
      if (res.length < n && !years[e.year]) {
        years[e.year] = true;
        res.push(e);
      }
    });
    return res;
  };

  // Наибольшая возрастающая подпоследовательность (строгая).
  // Возвращает массив индексов исходного массива.
  App.lis = function (values) {
    var n = values.length;
    if (!n) return [];
    var len = [], prev = [], best = 0, i, j;
    for (i = 0; i < n; i++) {
      len[i] = 1; prev[i] = -1;
      for (j = 0; j < i; j++) {
        if (values[j] < values[i] && len[j] + 1 > len[i]) {
          len[i] = len[j] + 1; prev[i] = j;
        }
      }
      if (len[i] > len[best]) best = i;
    }
    var out = [];
    for (i = best; i !== -1; i = prev[i]) out.push(i);
    return out.reverse();
  };

  // ---------- DOM ----------
  App.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'draggable' || k === 'disabled' || k === 'hidden') node[k] = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  };

  App.btn = function (text, cls, onClick) {
    return App.el('button', { type: 'button', class: 'btn ' + (cls || ''), text: text, onclick: onClick });
  };

  // Шапка режима: кнопка «В меню» и заголовок.
  App.modeHeader = function (container, title) {
    container.appendChild(App.el('div', { class: 'mode-head' }, [
      App.btn('← В меню', 'ghost', function () { App.showMenu(); }),
      App.el('h2', { text: title })
    ]));
  };

  // Нижняя липкая панель с кнопками.
  App.bar = function (buttons) {
    return App.el('div', { class: 'bar' }, buttons);
  };

  // Оценка 2..5 по доле верных ответов (чистая функция).
  App.grade = function (correct, total) {
    var r = total ? correct / total : 0;
    if (r >= 0.9) return 5;
    if (r >= 0.7) return 4;
    if (r >= 0.5) return 3;
    return 2;
  };

  App.GRADE_INFO = {
    5: { img: 'images/knight-5.png', phrase: 'Победа! Ты настоящий рыцарь знаний!', alt: 'Рыцарь в восторге прыгает с поднятым мечом' },
    4: { img: 'images/knight-4.png', phrase: 'Хорошо! Ещё немного — и будет пятёрка.', alt: 'Спокойный дружелюбный рыцарь' },
    3: { img: 'images/knight-3.png', phrase: 'Можно лучше… Повтори и попробуй снова.', alt: 'Рыцарь вздыхает, опустив голову' },
    2: { img: 'images/knight-2.png', phrase: 'Не сдавайся! Попробуй ещё раз.', alt: 'Грустный рыцарь сидит со слезой на щеке' }
  };

  // Текст для «Поделиться» (чистая функция).
  App.shareText = function (modeName, grade, correct, total, label) {
    var mode = App.modes && App.modes[modeName];
    var title = mode && mode.title;
    return 'История Средних веков' + (title ? ' — «' + title + '»' : '') +
      ': оценка ' + grade + ' (' + (label || 'верно').toLowerCase() + ' ' + correct + ' из ' + total + ') \uD83D\uDEE1\uFE0F';
  };

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) {}
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  // Копирует текст; возвращает Promise<boolean>.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        return navigator.clipboard.writeText(text).then(function () { return true; },
          function () { return legacyCopy(text); });
      } catch (e) { /* падаем на запасной вариант */ }
    }
    return Promise.resolve(legacyCopy(text));
  }

  // Нативное меню «Поделиться» или копирование в буфер.
  function shareResult(btn, text) {
    var url = '';
    if (location.protocol === 'http:' || location.protocol === 'https:') url = location.origin + location.pathname;
    var full = url ? text + ' ' + url : text;

    function flash() {
      clearTimeout(btn._timer);
      btn.textContent = 'Скопировано ✓';
      btn._timer = setTimeout(function () { btn.textContent = '↗ Поделиться'; }, 2000);
    }
    function fallback() {
      copyText(full).then(function (ok) {
        if (ok) flash();
        else window.prompt('Скопируйте результат:', full);
      });
    }

    if (navigator.share) {
      var data = { title: 'История Средних веков', text: text };
      if (url) data.url = url;
      try {
        navigator.share(data).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          fallback();
        });
      } catch (e) {
        fallback();
      }
    } else {
      fallback();
    }
  }

  App.renderResultHeader = function (container, correct, total, label) {
    var grade = App.grade(correct, total);
    var info = App.GRADE_INFO[grade];
    var cls = grade >= 4 ? 'good' : (grade === 3 ? 'mid' : 'low');
    var text = App.shareText(App.currentMode, grade, correct, total, label);
    var shareBtn = App.el('button', { type: 'button', class: 'btn share-btn', text: '↗ Поделиться' });
    shareBtn.addEventListener('click', function () {
      if (App.track) App.track('share', { mode: App.currentMode });
      shareResult(shareBtn, text);
    });
    if (App.track) App.track('result', { mode: App.currentMode, grade: grade });
    var box = App.el('div', { class: 'result ' + cls + ' grade-' + grade }, [
      App.el('img', { class: 'result-knight', src: info.img, alt: info.alt }),
      App.el('div', { class: 'result-body' }, [
        App.el('div', { class: 'result-top' }, [
          App.el('div', { class: 'result-grade', text: 'Оценка: ' + grade }),
          shareBtn
        ]),
        App.el('div', { class: 'result-score', text: (label || 'Верно') + ' ' + correct + ' из ' + total }),
        App.el('div', { class: 'result-phrase', text: info.phrase }),
        (App.currentMode === 'order' || App.currentMode === 'dates')
          ? App.el('a', { class: 'result-memo-link', href: 'pamyatka.html', text: '📜 Памятка: как быстро выучить даты' })
          : null
      ])
    ]);
    container.appendChild(box);
    return box;
  };

  App.scrollTo = function (node) {
    try { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { window.scrollTo(0, 0); }
  };

  App.showMenu = function () {
    var menu = document.getElementById('menu');
    var box = document.getElementById('mode');
    box.textContent = '';
    box.hidden = true;
    menu.hidden = false;
    if (location.hash) location.hash = '';
    window.scrollTo(0, 0);
  };

  App.openMode = function (name) {
    var mode = App.modes[name];
    if (!mode) { App.showMenu(); return; }
    App.currentMode = name;
    if (App.track) App.track('mode_open', { mode: name });
    var box = document.getElementById('mode');
    document.getElementById('menu').hidden = true;
    box.hidden = false;
    box.textContent = '';
    window.scrollTo(0, 0);
    mode.start(box);
  };

  // ---------- Общий движок викторины (режимы 2 и 4) ----------
  // opts: { container, title, questions, restart }
  // question: { prompt, promptClass, options: [{ text, review, correct }] }
  App.runQuiz = function (opts) {
    var c = opts.container, el = App.el;
    var questions = opts.questions, total = questions.length;
    var idx = 0, score = 0, mistakes = [];

    function showQuestion() {
      c.textContent = '';
      App.modeHeader(c, opts.title);
      var q = questions[idx];
      var answered = false;
      var optBox = el('div', { class: 'options' });
      var nextBtn = App.btn(idx === total - 1 ? 'Результат' : 'Далее', 'primary', function () {
        idx++;
        if (idx >= total) showResult(); else showQuestion();
        window.scrollTo(0, 0);
      });
      nextBtn.hidden = true;

      var buttons = q.options.map(function (o) {
        var b = el('button', { type: 'button', class: 'option', text: o.text });
        b.addEventListener('click', function () {
          if (answered) return;
          answered = true;
          buttons.forEach(function (bb, i) {
            bb.classList.add('locked');
            if (q.options[i].correct) bb.classList.add('correct');
          });
          if (o.correct) score++;
          else {
            b.classList.add('wrong');
            mistakes.push({
              prompt: q.prompt,
              chosen: o.review || o.text,
              correct: (q.options.filter(function (x) { return x.correct; })[0]).review ||
                       (q.options.filter(function (x) { return x.correct; })[0]).text
            });
          }
          nextBtn.hidden = false;
          try { nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        });
        optBox.appendChild(b);
        return b;
      });

      c.appendChild(el('div', { class: 'card quiz-card' }, [
        el('div', { class: 'progress-line' }, [
          el('span', { text: 'Вопрос ' + (idx + 1) + ' из ' + total }),
          el('span', { class: 'progress-score', text: 'Верно: ' + score })
        ]),
        el('div', { class: 'progress-track' }, [
          el('div', { class: 'progress-fill', style: 'width:' + Math.round(idx / total * 100) + '%' })
        ]),
        el('div', { class: 'prompt ' + (q.promptClass || ''), text: q.prompt }),
        optBox
      ]));
      c.appendChild(App.bar([nextBtn]));
    }

    function showResult() {
      c.textContent = '';
      App.modeHeader(c, opts.title);
      var head = App.renderResultHeader(c, score, total);
      if (!mistakes.length) {
        c.appendChild(el('div', { class: 'card note-ok', text: 'Ошибок нет — отличный результат!' }));
      } else {
        c.appendChild(el('h3', { class: 'section-title', text: 'Ошибки (' + mistakes.length + ')' }));
        mistakes.forEach(function (m) {
          c.appendChild(el('div', { class: 'card mistake' }, [
            el('div', { class: 'mistake-prompt', text: m.prompt }),
            el('div', { class: 'answer wrong-text', text: 'Ваш ответ: ' + m.chosen }),
            el('div', { class: 'answer right-text', text: 'Правильно: ' + m.correct })
          ]));
        });
      }
      c.appendChild(App.bar([
        App.btn('Ещё раз', 'primary', opts.restart),
        App.btn('В меню', '', function () { App.showMenu(); })
      ]));
      App.scrollTo(head);
    }

    showQuestion();
  };
})(typeof window !== 'undefined' ? window : this);
