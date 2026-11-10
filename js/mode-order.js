// Режим 3: расставь события по порядку.
// Перетаскивание — на pointer events: карточка «поднимается» и вставляется МЕЖДУ другими карточками
// (на старом месте стоит placeholder, который перемещается вслед за указателем).
(function () {
  'use strict';
  var N = 10;
  var DRAG_THRESHOLD = 5;   // px, после которых начинается перетаскивание
  var EDGE = 60;            // px от края окна, где включается автопрокрутка

  App.modes.order = {
    title: 'Расставь события по порядку',
    start: function (c) {
      var el = App.el;
      var events = App.pickOrderEvents(N);
      var sorted = events.slice().sort(function (a, b) { return a.year - b.year; });
      var items = App.shuffle(events);
      var checked = false;
      var okSet = {};         // индексы элементов, входящих в LIS
      var drag = null;        // состояние текущего перетаскивания

      c.textContent = '';
      App.modeHeader(c, App.modes.order.title);
      c.appendChild(el('p', { class: 'hint', text: 'Расположи события от самого раннего (вверху) к самому позднему (внизу). ' +
        'Перетаскивай карточку за значок «⠿» (мышью — за любое место карточки) или используй кнопки ↑ ↓.' }));
      var resultBox = el('div');
      c.appendChild(resultBox);
      var list = el('ol', { class: 'order-list' });
      c.appendChild(list);
      var extra = el('div');
      c.appendChild(extra);

      function move(from, to) {
        if (to < 0 || to >= N || from === to) return;
        var it = items.splice(from, 1)[0];
        items.splice(to, 0, it);
      }

      // ---------- Перетаскивание ----------
      function closest(node, sel) {
        return node && node.closest ? node.closest(sel) : null;
      }

      // Карточки списка, кроме перетаскиваемой и placeholder.
      function otherCards() {
        return Array.prototype.filter.call(list.children, function (n) {
          return n !== drag.li && n !== drag.ph;
        });
      }

      function positionCard() {
        drag.li.style.left = (drag.x - drag.offX) + 'px';
        drag.li.style.top = (drag.y - drag.offY) + 'px';
      }

      function placeholderIndex() {
        var kids = otherCards(), idx = 0;
        for (var k = 0; k < kids.length; k++) {
          if (kids[k].compareDocumentPosition(drag.ph) & 2) break; // kids[k] после placeholder
          idx++;
        }
        return idx;
      }

      function updatePlaceholder() {
        var kids = otherCards(), want = kids.length, before = null;
        for (var k = 0; k < kids.length; k++) {
          var r = kids[k].getBoundingClientRect();
          if (drag.y < r.top + r.height / 2) { want = k; before = kids[k]; break; }
        }
        if (want !== placeholderIndex()) list.insertBefore(drag.ph, before);
      }

      function tick() {
        if (!drag || !drag.active) return;
        var vh = window.innerHeight, y = drag.y, dy = 0;
        if (y < EDGE) dy = -Math.min(18, Math.ceil((EDGE - y) / EDGE * 14) + 2);
        else if (y > vh - EDGE) dy = Math.min(18, Math.ceil((y - (vh - EDGE)) / EDGE * 14) + 2);
        if (dy) {
          window.scrollBy(0, dy);
          updatePlaceholder();
        }
        drag.raf = requestAnimationFrame(tick);
      }

      function startDrag() {
        var li = drag.li, rect = li.getBoundingClientRect();
        drag.active = true;
        drag.offX = drag.sx - rect.left;
        drag.offY = drag.sy - rect.top;
        drag.ph = el('li', { class: 'order-placeholder', 'aria-hidden': 'true' });
        drag.ph.style.height = rect.height + 'px';
        list.insertBefore(drag.ph, li);
        li.style.width = rect.width + 'px';
        li.classList.add('dragging');
        document.body.classList.add('order-dragging');
        document.addEventListener('keydown', onKey);
        positionCard();
        drag.raf = requestAnimationFrame(tick);
      }

      function swallowClick(e) { e.stopPropagation(); e.preventDefault(); }

      function endDrag(commit) {
        var d = drag;
        if (!d) return;
        drag = null;
        d.li.removeEventListener('pointermove', onMove);
        d.li.removeEventListener('pointerup', onUp);
        d.li.removeEventListener('pointercancel', onCancel);
        try { d.li.releasePointerCapture(d.id); } catch (err) {}
        if (!d.active) return;
        cancelAnimationFrame(d.raf);
        document.removeEventListener('keydown', onKey);
        document.body.classList.remove('order-dragging');
        var newIdx = null;
        drag = d; // placeholderIndex использует drag
        if (commit) newIdx = placeholderIndex();
        drag = null;
        if (newIdx !== null) move(d.idx, newIdx);
        // подавляем клик, который браузер может выдать сразу после отпускания
        window.addEventListener('click', swallowClick, true);
        setTimeout(function () { window.removeEventListener('click', swallowClick, true); }, 0);
        render();
      }

      function onKey(e) {
        if (e.key === 'Escape') endDrag(false);
      }

      function onMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (!drag.active) {
          if (Math.sqrt(Math.pow(drag.x - drag.sx, 2) + Math.pow(drag.y - drag.sy, 2)) <= DRAG_THRESHOLD) return;
          startDrag();
        }
        if (e.cancelable) e.preventDefault();
        positionCard();
        updatePlaceholder();
      }

      function onUp(e) {
        if (!drag || e.pointerId !== drag.id) return;
        endDrag(true);
      }

      function onCancel(e) {
        if (!drag || e.pointerId !== drag.id) return;
        endDrag(false);
      }

      function onPointerDown(e, li, i) {
        if (checked || drag) return;
        if (e.pointerType === 'mouse') {
          if (e.button !== 0) return;
          if (closest(e.target, '.move-btn')) return;
        } else if (!closest(e.target, '.drag-handle')) {
          return; // касание/перо: только за «ручку»
        }
        drag = { idx: i, li: li, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
          offX: 0, offY: 0, active: false, ph: null, raf: 0 };
        try { li.setPointerCapture(e.pointerId); } catch (err) {}
        li.addEventListener('pointermove', onMove);
        li.addEventListener('pointerup', onUp);
        li.addEventListener('pointercancel', onCancel);
      }

      // ---------- Отрисовка ----------
      function render(focusIdx, focusDir) {
        list.textContent = '';
        items.forEach(function (ev, i) {
          var cls = 'order-item';
          if (checked) cls += okSet[i] ? ' ok' : ' bad';

          var body = [];
          if (!checked) {
            body.push(el('span', { class: 'drag-handle', title: 'Перетащить', 'aria-hidden': 'true', text: '⠿' }));
          }
          body.push(el('span', { class: 'order-num', text: String(i + 1) }));
          body.push(el('span', { class: 'order-text' }, [
            el('span', { text: ev.text }),
            checked ? el('span', { class: 'order-date', text: ev.label }) : null,
            checked && !okSet[i] ? el('span', { class: 'order-hint', text: 'должно быть на месте ' + (sorted.indexOf(ev) + 1) }) : null
          ]));

          var upBtn = null, downBtn = null;
          if (!checked) {
            upBtn = el('button', { type: 'button', class: 'move-btn', 'aria-label': 'Поднять выше', text: '↑', disabled: i === 0,
              onclick: function (e) { e.stopPropagation(); move(i, i - 1); render(i - 1, 'up'); } });
            downBtn = el('button', { type: 'button', class: 'move-btn', 'aria-label': 'Опустить ниже', text: '↓', disabled: i === N - 1,
              onclick: function (e) { e.stopPropagation(); move(i, i + 1); render(i + 1, 'down'); } });
            body.push(el('span', { class: 'order-btns' }, [upBtn, downBtn]));
          }

          var li = el('li', { class: cls }, body);
          if (!checked) {
            li.addEventListener('pointerdown', function (e) { onPointerDown(e, li, i); });
          }
          list.appendChild(li);

          if (i === focusIdx) {
            var target = focusDir === 'up' ? upBtn : downBtn;
            if (target && target.disabled) target = focusDir === 'up' ? downBtn : upBtn;
            if (target) target.focus();
          }
        });
      }

      function showCorrect() {
        extra.textContent = '';
        extra.appendChild(el('h3', { class: 'section-title', text: 'Правильный порядок' }));
        var ol = el('ol', { class: 'order-list' });
        sorted.forEach(function (ev, i) {
          ol.appendChild(el('li', { class: 'order-item static' }, [
            el('span', { class: 'order-num', text: String(i + 1) }),
            el('span', { class: 'order-text' }, [
              el('span', { text: ev.text }),
              el('span', { class: 'order-date', text: ev.label })
            ])
          ]));
        });
        extra.appendChild(ol);
        App.scrollTo(extra);
      }

      function check() {
        if (drag) endDrag(false);
        checked = true;
        var years = items.map(function (e) { return e.year; });
        var lis = App.lis(years);
        okSet = {};
        lis.forEach(function (i) { okSet[i] = true; });
        render();
        resultBox.textContent = '';
        var head = App.renderResultHeader(resultBox, lis.length, N, 'На своих местах');
        bar.textContent = '';
        bar.appendChild(App.btn('Показать правильный порядок', '', showCorrect));
        bar.appendChild(App.btn('Ещё раз', 'primary', function () { App.modes.order.start(c); window.scrollTo(0, 0); }));
        bar.appendChild(App.btn('В меню', '', function () { App.showMenu(); }));
        App.scrollTo(head);
      }

      var bar = App.bar([App.btn('Проверить', 'primary', check)]);
      c.appendChild(bar);
      render();
    }
  };
})();
