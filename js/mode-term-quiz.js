// Режим 2: выбери определение к термину.
(function () {
  'use strict';

  App.modes.terms = {
    title: 'Выбери определение',
    start: function (c) {
      var targets = App.sample(window.TERMS, 20);
      var questions = targets.map(function (t) {
        var options = App.shuffle([t].concat(App.pickSimilarTerms(t, 4))).map(function (x) {
          return { text: x.def, correct: x === t };
        });
        return { prompt: t.term, promptClass: 'prompt-term', options: options };
      });
      App.runQuiz({
        container: c,
        title: App.modes.terms.title,
        questions: questions,
        restart: function () { App.modes.terms.start(c); window.scrollTo(0, 0); }
      });
    }
  };
})();
