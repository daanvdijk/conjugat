import { useEffect, useMemo, useRef, useState } from "react";
import verbs from "./data/verbs.json";
import {
  identifyUserProperties,
  initAnalytics,
  setAnalyticsEnabled,
  trackEvent,
} from "./analytics.js";

const PERSONS = ["jo", "tu", "ell", "nosaltres", "vosaltres", "ells"];
const TENSES = ["present", "imperfect", "future", "conditional"];
const GOALS = [25, 50, 100];
const DEFAULT_ANALYTICS_ENABLED = Boolean(import.meta.env.VITE_AMPLITUDE_KEY);
const FEEDBACK_EMAIL = import.meta.env.VITE_FEEDBACK_EMAIL;

const PERSON_LABELS = {
  jo: "jo",
  tu: "tu",
  ell: "ell/ella",
  nosaltres: "nosaltres",
  vosaltres: "vosaltres",
  ells: "ells/elles",
};

const PERSON_SETTINGS_LABELS = {
  jo: "jo",
  tu: "tu",
  ell: "ell/ella",
  nosaltres: "nosaltres",
  vosaltres: "vosaltres",
  ells: "ells/elles",
};

const TENSE_LABELS = {
  present: "present",
  imperfect: "imperfet",
  future: "futur",
  conditional: "condicional",
};

function stripAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function baseChar(char) {
  return stripAccents(char.toLowerCase());
}

function getStatus(typedChar, expectedChar, isHinted) {
  if (!typedChar) return "empty";
  if (isHinted) return "yellow";
  const typedLower = typedChar.toLowerCase();
  const expectedLower = expectedChar.toLowerCase();
  if (typedLower === expectedLower) return "green";
  if (baseChar(typedLower) === baseChar(expectedLower)) return "yellow";
  return "red";
}

function findFirstRedIndex(typed, expected, hintedSet) {
  for (let i = 0; i < typed.length; i += 1) {
    const expectedChar = expected[i];
    if (!expectedChar) return i;
    const status = getStatus(typed[i], expectedChar, hintedSet?.has(i));
    if (status === "red") return i;
  }
  return -1;
}

function getVerbGroup(infinitive) {
  if (infinitive.endsWith("ar")) return "ar";
  if (infinitive.endsWith("ir")) return "ir";
  if (infinitive.endsWith("er") || infinitive.endsWith("re")) return "er";
  return "ar";
}

function regularPresent(infinitive, group, person) {
  const stem = infinitive.slice(0, -2);
  if (group === "ar") {
    return (
      {
        jo: `${stem}o`,
        tu: `${stem}es`,
        ell: `${stem}a`,
        nosaltres: `${stem}em`,
        vosaltres: `${stem}eu`,
        ells: `${stem}en`,
      }[person] ?? ""
    );
  }
  if (group === "ir") {
    return (
      {
        jo: `${stem}o`,
        tu: `${stem}s`,
        ell: `${stem}`,
        nosaltres: `${stem}im`,
        vosaltres: `${stem}iu`,
        ells: `${stem}en`,
      }[person] ?? ""
    );
  }
  return (
    {
      jo: `${stem}o`,
      tu: `${stem}s`,
      ell: `${stem}`,
      nosaltres: `${stem}em`,
      vosaltres: `${stem}eu`,
      ells: `${stem}en`,
    }[person] ?? ""
  );
}

function regularImperfect(infinitive, group, person) {
  const stem = infinitive.slice(0, -2);
  if (group === "ar") {
    return (
      {
        jo: `${stem}ava`,
        tu: `${stem}aves`,
        ell: `${stem}ava`,
        nosaltres: `${stem}àvem`,
        vosaltres: `${stem}àveu`,
        ells: `${stem}aven`,
      }[person] ?? ""
    );
  }
  return (
    {
      jo: `${stem}ia`,
      tu: `${stem}ies`,
      ell: `${stem}ia`,
      nosaltres: `${stem}íem`,
      vosaltres: `${stem}íeu`,
      ells: `${stem}ien`,
    }[person] ?? ""
  );
}

function regularFuture(infinitive, person) {
  return (
    {
      jo: `${infinitive}é`,
      tu: `${infinitive}às`,
      ell: `${infinitive}à`,
      nosaltres: `${infinitive}em`,
      vosaltres: `${infinitive}eu`,
      ells: `${infinitive}an`,
    }[person] ?? ""
  );
}

function regularConditional(infinitive, person) {
  return (
    {
      jo: `${infinitive}ia`,
      tu: `${infinitive}ies`,
      ell: `${infinitive}ia`,
      nosaltres: `${infinitive}íem`,
      vosaltres: `${infinitive}íeu`,
      ells: `${infinitive}ien`,
    }[person] ?? ""
  );
}

function getConjugation(verb, tense, person) {
  if (verb.tenses && verb.tenses[tense]?.[person]) {
    return verb.tenses[tense][person];
  }
  const group = verb.group ?? getVerbGroup(verb.infinitive);
  if (tense === "present") {
    return (
      verb.present?.[person] ?? regularPresent(verb.infinitive, group, person)
    );
  }
  if (tense === "imperfect") {
    return regularImperfect(verb.infinitive, group, person);
  }
  if (tense === "future") {
    return regularFuture(verb.infinitive, person);
  }
  if (tense === "conditional") {
    return regularConditional(verb.infinitive, person);
  }
  return "";
}

function pickNextPrompt(enabledPersons, enabledTenses, verbFilters, lastKey) {
  const enabled = PERSONS.filter((person) => enabledPersons[person]);
  const enabledTenseList = TENSES.filter((tense) => enabledTenses[tense]);
  if (enabled.length === 0) return null;
  if (enabledTenseList.length === 0) return null;

  const filteredVerbs = verbs.filter((verb) => {
    const regular = verb.regular !== false;
    if (regular && !verbFilters.regular) return false;
    if (!regular && !verbFilters.irregular) return false;
    return true;
  });

  if (filteredVerbs.length === 0) return null;

  let next = null;
  let tries = 0;
  while (!next || (lastKey && next.key === lastKey && tries < 10)) {
    const verb =
      filteredVerbs[Math.floor(Math.random() * filteredVerbs.length)];
    const person = enabled[Math.floor(Math.random() * enabled.length)];
    const tense =
      enabledTenseList[Math.floor(Math.random() * enabledTenseList.length)];
    next = {
      verb,
      person,
      tense,
      key: `${verb.infinitive}-${person}-${tense}`,
    };
    tries += 1;
  }
  return next;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPromptAllowed(prompt, enabledPersons, enabledTenses, verbFilters) {
  if (!prompt) return false;
  if (!enabledPersons[prompt.person]) return false;
  if (!enabledTenses[prompt.tense]) return false;
  const isRegular = prompt.verb.regular !== false;
  if (isRegular && !verbFilters.regular) return false;
  if (!isRegular && !verbFilters.irregular) return false;
  return true;
}

export default function App() {
  const inputRef = useRef(null);
  const feedbackRef = useRef(null);
  const promptStartRef = useRef(null);
  const [enabledPersons, setEnabledPersons] = useState({
    jo: true,
    tu: true,
    ell: true,
    nosaltres: true,
    vosaltres: true,
    ells: true,
  });
  const [enabledTenses, setEnabledTenses] = useState({
    present: true,
    imperfect: true,
    future: true,
    conditional: true,
  });
  const [verbFilters, setVerbFilters] = useState({
    regular: true,
    irregular: true,
  });
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [hintedIndices, setHintedIndices] = useState(() => new Set());
  const [isCatalanTheme, setIsCatalanTheme] = useState(true);
  const [dailyGoal, setDailyGoal] = useState(50);
  const [dailyProgress, setDailyProgress] = useState(0);
  const [dailyDateKey, setDailyDateKey] = useState(getLocalDateKey());
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [confettiBig, setConfettiBig] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(
    DEFAULT_ANALYTICS_ENABLED,
  );
  const [hintsUsed, setHintsUsed] = useState(0);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const expectedAnswer = useMemo(() => {
    if (!currentPrompt) return "";
    return getConjugation(
      currentPrompt.verb,
      currentPrompt.tense,
      currentPrompt.person,
    );
  }, [currentPrompt]);

  useEffect(() => {
    if (!currentPrompt) {
      setCurrentPrompt(
        pickNextPrompt(enabledPersons, enabledTenses, verbFilters, null),
      );
    }
  }, [currentPrompt, enabledPersons, enabledTenses, verbFilters]);

  useEffect(() => {
    if (
      currentPrompt &&
      !isPromptAllowed(
        currentPrompt,
        enabledPersons,
        enabledTenses,
        verbFilters,
      )
    ) {
      setInputValue("");
      setHintedIndices(new Set());
      setCurrentPrompt(
        pickNextPrompt(
          enabledPersons,
          enabledTenses,
          verbFilters,
          currentPrompt.key,
        ),
      );
    }
  }, [currentPrompt, enabledPersons, enabledTenses, verbFilters]);

  useEffect(() => {
    if (!currentPrompt) return;
    promptStartRef.current = Date.now();
    trackEvent("prompt_started", {
      verb: currentPrompt.verb.infinitive,
      person: currentPrompt.person,
      tense: currentPrompt.tense,
    });
  }, [currentPrompt]);

  useEffect(() => {
    if (!currentPrompt) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        trackEvent("session_end");
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);
    return () =>
      window.removeEventListener("visibilitychange", handleVisibility);
  }, [currentPrompt]);

  useEffect(() => {
    if (!feedbackOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentPrompt, feedbackOpen]);

  useEffect(() => {
    if (feedbackOpen) {
      requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }, [feedbackOpen]);

  useEffect(() => {
    if (!feedbackOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setFeedbackOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [feedbackOpen]);

  useEffect(() => {
    const storedTheme = localStorage.getItem("conjugat_theme");
    if (storedTheme === "catalan") {
      setIsCatalanTheme(true);
    } else if (storedTheme === "default") {
      setIsCatalanTheme(false);
    } else {
      localStorage.setItem("conjugat_theme", "catalan");
    }
    const storedGoal = localStorage.getItem("conjugat_goal");
    const storedProgress = localStorage.getItem("conjugat_progress");
    const storedDate = localStorage.getItem("conjugat_date");
    if (storedGoal) {
      const parsedGoal = Number(storedGoal);
      if (GOALS.includes(parsedGoal)) {
        setDailyGoal(parsedGoal);
      }
    }
    if (storedDate && storedDate === getLocalDateKey()) {
      setDailyDateKey(storedDate);
      setDailyProgress(Number(storedProgress) || 0);
    } else {
      localStorage.setItem("conjugat_date", getLocalDateKey());
      localStorage.setItem("conjugat_progress", "0");
    }
    const storedSettings = localStorage.getItem("conjugat_settings");
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        if (parsed.enabledPersons) setEnabledPersons(parsed.enabledPersons);
        if (parsed.enabledTenses) setEnabledTenses(parsed.enabledTenses);
        if (parsed.verbFilters) setVerbFilters(parsed.verbFilters);
        if (parsed.analyticsEnabled !== undefined) {
          setAnalyticsEnabledState(Boolean(parsed.analyticsEnabled));
        } else {
          setAnalyticsEnabledState(DEFAULT_ANALYTICS_ENABLED);
        }
      } catch {
        // ignore invalid settings
      }
    }
    trackEvent("session_start");
  }, []);

  useEffect(() => {
    document.body.dataset.theme = isCatalanTheme ? "catalan" : "default";
    localStorage.setItem(
      "conjugat_theme",
      isCatalanTheme ? "catalan" : "default",
    );
    trackEvent("settings_changed", { setting: "theme", value: isCatalanTheme });
  }, [isCatalanTheme]);

  useEffect(() => {
    localStorage.setItem(
      "conjugat_settings",
      JSON.stringify({
        enabledPersons,
        enabledTenses,
        verbFilters,
        analyticsEnabled,
      }),
    );
  }, [enabledPersons, enabledTenses, verbFilters, analyticsEnabled]);

  useEffect(() => {
    initAnalytics({ enabled: analyticsEnabled });
    setAnalyticsEnabled(analyticsEnabled);
  }, [analyticsEnabled]);

  useEffect(() => {
    identifyUserProperties({
      daily_goal: dailyGoal,
      theme: isCatalanTheme ? "catalan" : "default",
      regular_only: verbFilters.regular && !verbFilters.irregular,
      irregular_on: verbFilters.irregular,
      tenses_enabled: Object.keys(enabledTenses).filter(
        (key) => enabledTenses[key],
      ),
      persons_enabled: Object.keys(enabledPersons).filter(
        (key) => enabledPersons[key],
      ),
    });
  }, [
    dailyGoal,
    isCatalanTheme,
    verbFilters,
    enabledTenses,
    enabledPersons,
    analyticsEnabled,
  ]);

  useEffect(() => {
    if (!expectedAnswer) return undefined;
    const inputLower = inputValue.toLowerCase();
    const expectedLower = expectedAnswer.toLowerCase();
    if (
      inputLower === expectedLower &&
      inputLower.length === expectedLower.length
    ) {
      const timeout = setTimeout(() => {
        const todayKey = getLocalDateKey();
        setDailyDateKey((prevDate) => {
          const isSameDay = prevDate === todayKey;
          const nextDate = isSameDay ? prevDate : todayKey;
          setDailyProgress((prevProgress) => {
            const nextValue = isSameDay ? prevProgress + 1 : 1;
            const reachedGoal = nextValue === dailyGoal;
            localStorage.setItem("conjugat_date", todayKey);
            localStorage.setItem("conjugat_progress", String(nextValue));
            setConfettiBig(reachedGoal);
            if (reachedGoal) {
              trackEvent("goal_reached", { goal: dailyGoal });
            }
            return nextValue;
          });
          return nextDate;
        });
        const next = pickNextPrompt(
          enabledPersons,
          enabledTenses,
          verbFilters,
          currentPrompt?.key,
        );
        setInputValue("");
        setHintedIndices(new Set());
        setCurrentPrompt(next);
        setConfettiBurst((prev) => prev + 1);
        const timeToAnswerMs = promptStartRef.current
          ? Date.now() - promptStartRef.current
          : null;
        trackEvent("prompt_completed", {
          verb: currentPrompt?.verb?.infinitive,
          person: currentPrompt?.person,
          tense: currentPrompt?.tense,
          hints_used: hintsUsed,
          time_to_answer_ms: timeToAnswerMs,
        });
        setHintsUsed(0);
      }, 300);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [
    inputValue,
    expectedAnswer,
    enabledPersons,
    currentPrompt,
    dailyGoal,
    enabledTenses,
    verbFilters,
    hintsUsed,
  ]);

  useEffect(() => {
    if (!expectedAnswer) return;
    setHintedIndices((prev) => {
      const next = new Set(prev);
      for (const index of prev) {
        if (!inputValue[index]) {
          next.delete(index);
          continue;
        }
        if (
          inputValue[index].toLowerCase() !==
          expectedAnswer[index]?.toLowerCase()
        ) {
          next.delete(index);
        }
      }
      return next;
    });
  }, [inputValue, expectedAnswer]);

  const handleInputChange = (event) => {
    const rawValue = event.target.value;
    const normalized = rawValue.toLowerCase();
    let nextValue = normalized;

    if (expectedAnswer) {
      if (nextValue.length > expectedAnswer.length) {
        nextValue = nextValue.slice(0, expectedAnswer.length);
      }
      const redIndex = findFirstRedIndex(
        nextValue,
        expectedAnswer,
        hintedIndices,
      );
      if (redIndex !== -1) {
        nextValue = nextValue.slice(0, redIndex + 1);
      }
    }

    setInputValue(nextValue);
  };

  const handleHint = () => {
    if (!expectedAnswer) return;
    const expectedLower = expectedAnswer.toLowerCase();
    let index = 0;
    while (index < expectedLower.length) {
      if (!inputValue[index]) break;
      if (inputValue[index].toLowerCase() !== expectedLower[index]) break;
      index += 1;
    }
    if (index >= expectedLower.length) return;

    const nextChars = inputValue.split("");
    if (index < nextChars.length) {
      nextChars[index] = expectedAnswer[index];
    } else {
      nextChars.push(expectedAnswer[index]);
    }
    setInputValue(nextChars.join("").toLowerCase());
    setHintedIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    setHintsUsed((prev) => prev + 1);
    trackEvent("hint_used");

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleGoalChange = (goal) => {
    setDailyGoal(goal);
    localStorage.setItem("conjugat_goal", String(goal));
    trackEvent("settings_changed", { setting: "daily_goal", value: goal });
  };

  const confettiPieces = useMemo(() => {
    if (confettiBurst === 0) return [];
    const colors = ["#1f8b4c", "#c88b00", "#c9252d", "#0f766e", "#f2c53a"];
    const count = confettiBig ? 54 : 28;
    const minDistance = confettiBig ? 100 : 60;
    const maxDistance = confettiBig ? 200 : 120;
    return Array.from({ length: count }).map((_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const distance =
        minDistance + Math.random() * (maxDistance - minDistance);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance - (confettiBig ? 60 : 30);
      const rotation = Math.random() * 260;
      const delay = Math.random() * (confettiBig ? 180 : 120);
      const color = colors[index % colors.length];
      return {
        key: `${confettiBurst}-${index}`,
        style: {
          "--x": `${x}px`,
          "--y": `${y}px`,
          "--r": `${rotation}deg`,
          "--delay": `${delay}ms`,
          "--color": color,
        },
      };
    });
  }, [confettiBurst, confettiBig]);

  const togglePerson = (person) => {
    if (currentPrompt && currentPrompt.person === person) {
      trackEvent("prompt_abandoned", {
        reason: "person_disabled",
        verb: currentPrompt.verb.infinitive,
        person: currentPrompt.person,
        tense: currentPrompt.tense,
      });
    }
    setEnabledPersons((prev) => {
      const enabledCount = Object.values(prev).filter(Boolean).length;
      if (prev[person] && enabledCount === 1) return prev;
      return { ...prev, [person]: !prev[person] };
    });
    trackEvent("settings_changed", { setting: "person", value: person });
  };

  const toggleTense = (tense) => {
    if (currentPrompt && currentPrompt.tense === tense) {
      trackEvent("prompt_abandoned", {
        reason: "tense_disabled",
        verb: currentPrompt.verb.infinitive,
        person: currentPrompt.person,
        tense: currentPrompt.tense,
      });
    }
    setEnabledTenses((prev) => {
      const enabledCount = Object.values(prev).filter(Boolean).length;
      if (prev[tense] && enabledCount === 1) return prev;
      return { ...prev, [tense]: !prev[tense] };
    });
    trackEvent("settings_changed", { setting: "tense", value: tense });
  };

  const toggleVerbFilter = (key) => {
    if (currentPrompt) {
      const isRegular = currentPrompt.verb.regular !== false;
      const wouldDisableCurrent =
        (key === "regular" && isRegular) || (key === "irregular" && !isRegular);
      if (wouldDisableCurrent) {
        trackEvent("prompt_abandoned", {
          reason: "verb_filter_disabled",
          verb: currentPrompt.verb.infinitive,
          person: currentPrompt.person,
          tense: currentPrompt.tense,
        });
      }
    }
    setVerbFilters((prev) => {
      const enabledCount = Object.values(prev).filter(Boolean).length;
      if (prev[key] && enabledCount === 1) return prev;
      return { ...prev, [key]: !prev[key] };
    });
    trackEvent("settings_changed", { setting: "verb_filter", value: key });
  };

  const handleTitleClick = () => {
    setTitleClicks((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setEasterEggVisible((current) => !current);
        return 0;
      }
      return next;
    });
    setTimeout(() => setTitleClicks(0), 1200);
  };

  const handleSendFeedback = () => {
    if (!FEEDBACK_EMAIL) return;
    const subject = encodeURIComponent("Conjugat: possible error");
    const body = encodeURIComponent(feedbackText.trim());
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  };

  if (!currentPrompt) {
    return null;
  }

  return (
    <div className="app">
      <div className="card">
        <button type="button" className="title" onClick={handleTitleClick}>
          Conjugat
        </button>
        <div className="prompt">
          <div className="infinitive">
            {currentPrompt.verb.infinitive} — {currentPrompt.verb.translation}
          </div>
          <div className="meta">
            {PERSON_LABELS[currentPrompt.person]} ·{" "}
            {TENSE_LABELS[currentPrompt.tense]}
          </div>
        </div>

        <div className="input-area">
          <div className="typed">
            {inputValue.length === 0 && (
              <>
                <span className="caret idle" aria-hidden="true" />
                <span className="placeholder">Escriu la conjugació…</span>
              </>
            )}
            {inputValue.split("").map((char, index) => {
              const expectedChar = expectedAnswer[index] ?? "";
              const status = getStatus(
                char,
                expectedChar,
                hintedIndices.has(index),
              );
              return (
                <span key={`${char}-${index}`} className={`char ${status}`}>
                  {char}
                </span>
              );
            })}
            {inputValue.length > 0 && (
              <span className="caret" aria-hidden="true" />
            )}
          </div>
          {confettiBurst > 0 && (
            <div
              key={confettiBurst}
              className={`confetti ${confettiBig ? "big" : ""}`}
            >
              {confettiPieces.map((piece) => (
                <span
                  key={piece.key}
                  className="confetti-piece"
                  style={piece.style}
                />
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            className="ghost-input"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={() => {
              if (!feedbackOpen) {
                setTimeout(() => inputRef.current?.focus(), 0);
              }
            }}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={feedbackOpen}
            aria-label="Type conjugation"
          />
        </div>

        <div className="controls">
          <button className="hint-button" type="button" onClick={handleHint}>
            Pista (Hint)
          </button>
        </div>

        <details className="settings-accordion">
          <summary>Configuració</summary>

          <div className="settings">
            <div className="settings-title">Persones</div>
            <div className="settings-row">
              {PERSONS.map((person) => (
                <label
                  key={person}
                  className={`pill ${enabledPersons[person] ? "on" : "off"}`}
                >
                  <input
                    type="checkbox"
                    checked={enabledPersons[person]}
                    onChange={() => togglePerson(person)}
                  />
                  {PERSON_SETTINGS_LABELS[person]}
                </label>
              ))}
            </div>
          </div>

          <div className="settings">
            <div className="settings-title">Temps</div>
            <div className="settings-row">
              {TENSES.map((tense) => (
                <label
                  key={tense}
                  className={`pill ${enabledTenses[tense] ? "on" : "off"}`}
                >
                  <input
                    type="checkbox"
                    checked={enabledTenses[tense]}
                    onChange={() => toggleTense(tense)}
                  />
                  {TENSE_LABELS[tense]}
                </label>
              ))}
            </div>
          </div>

          <div className="settings">
            <div className="settings-title">Tipus de verbs</div>
            <div className="settings-row">
              {[
                { key: "regular", label: "regular" },
                { key: "irregular", label: "irregular" },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`pill ${verbFilters[item.key] ? "on" : "off"}`}
                >
                  <input
                    type="checkbox"
                    checked={verbFilters[item.key]}
                    onChange={() => toggleVerbFilter(item.key)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div className="settings">
            <div className="settings-title">Objectiu diari</div>
            <div className="goal-row">
              {GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  className={`goal-pill ${dailyGoal === goal ? "on" : "off"}`}
                  onClick={() => handleGoalChange(goal)}
                >
                  {goal}
                </button>
              ))}
            </div>
            <div className="goal-progress">
              {Math.min(dailyProgress, dailyGoal)} / {dailyGoal} avui
            </div>
            <div className="goal-bar">
              <div
                className="goal-fill"
                style={{
                  width: `${Math.min(100, (dailyProgress / dailyGoal) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="settings">
            <div className="settings-title">Tema</div>
            <div className="settings-row">
              <button
                type="button"
                className={`goal-pill ${isCatalanTheme ? "on" : "off"}`}
                onClick={() => setIsCatalanTheme((prev) => !prev)}
              >
                Colors catalans
              </button>
            </div>
          </div>
        </details>

        <div className="footnote">
          <span>Conjugat · © 2026 · fet per Daan</span>
          {easterEggVisible && (
            <span className="egg">· Visca Catalunya lliure.</span>
          )}
          <button
            type="button"
            className="feedback-link"
            onClick={() => setFeedbackOpen(true)}
          >
            Hi ha un error? Fes-m'ho saber
          </button>
        </div>
      </div>

      {feedbackOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setFeedbackOpen(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">Explica l'error</div>
            <p className="modal-text">Envia'ns un correu amb aquest text.</p>
            <textarea
              ref={feedbackRef}
              className="modal-input"
              rows={5}
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder="Quin verb, quina forma, i què hauria de dir?"
            />
            <div className="modal-actions">
              <button
                type="button"
                className="goal-pill off"
                onClick={() => setFeedbackOpen(false)}
              >
                Tanca
              </button>
              {FEEDBACK_EMAIL && (
                <button
                  type="button"
                  className="goal-pill on"
                  onClick={handleSendFeedback}
                >
                  Envia per correu
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
