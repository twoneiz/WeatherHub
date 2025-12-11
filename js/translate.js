const CONFIG = window.CONFIG || {};
const GOOGLE_TRANSLATE_API_KEY = CONFIG.googleTranslateApiKey;

function translateText(text, targetLang, callback) {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    console.warn("Google Translate API key missing in config.js. Skipping translation.");
    return callback(text);
  }
  if (Array.isArray(text)) {
    fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetLang
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.data && data.data.translations) {
        callback(data.data.translations.map(t => t.translatedText));
      } else {
        callback(text);
      }
    })
    .catch(() => callback(text));
  } else {
    fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetLang
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.data && data.data.translations && data.data.translations[0]) {
        callback(data.data.translations[0].translatedText);
      } else {
        callback(text);
      }
    })
    .catch(() => callback(text));
  }
}

function translateAll(targetLang, callback) {
  const elements = document.querySelectorAll('.translatable');
  const texts = Array.from(elements).map(el => {
    if (!el.dataset.original) {
      el.dataset.original = el.textContent;
    }
    return el.dataset.original;
  });

  translateText(texts, targetLang, translated => {
    elements.forEach((el, i) => {
      el.textContent = translated[i] || el.dataset.original;
    });
    if (callback) callback();
  });
}

function initTranslation() {
  const select = document.getElementById('languageSelect');
  if (!select) return;

  // Populate language options
  if (!GOOGLE_TRANSLATE_API_KEY) {
    translateAll('en');
    return;
  }

  fetch(`https://translation.googleapis.com/language/translate/v2/languages?key=${GOOGLE_TRANSLATE_API_KEY}&target=en`)
    .then(res => res.json())
    .then(data => {
      select.innerHTML = '<option value="en" selected>English</option>';
      if (data && data.data && data.data.languages) {
        data.data.languages.forEach(lang => {
          if (lang.language !== 'en') {
            const option = document.createElement('option');
            option.value = lang.language;
            option.textContent = lang.name || lang.language;
            select.appendChild(option);
          }
        });
      }
    });

  select.addEventListener('change', function() {
    translateAll(this.value);
  });

  translateAll('en');
}
