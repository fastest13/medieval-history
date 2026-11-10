// Режим 4: что произошло в этот год?
(function () {
  'use strict';

  App.modes.dates = {
    title: 'Что произошло в этот год?',
    start: function (c) {
      var targets = App.sample(window.EVENTS, 20);
      var questions = targets.map(function (e) {
        var options = App.shuffle([e].concat(App.pickNearEvents(e, 4))).map(function (x) {
          return { text: x.text, review: x.text + ' (' + x.label + ')', correct: x === e };
        });
        return { prompt: e.label, promptClass: 'prompt-date', options: options };
      });
      App.runQuiz({
        container: c,
        title: App.modes.dates.title,
        questions: questions,
        restart: function () { App.modes.dates.start(c); window.scrollTo(0, 0); }
      });
    }
  };
})();
