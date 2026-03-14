import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { verbs } from "../../shared";
import {
  identifyUserProperties,
  initAnalytics,
  setAnalyticsEnabled,
  trackEvent,
} from "./analytics";
import { initErrorTracking } from "./errorTracking";
import { Linking } from "react-native";

const PERSONS = ["jo", "tu", "ell", "nosaltres", "vosaltres", "ells"];
const TENSES = [
  "present",
  "imperfect",
  "future",
  "conditional",
  "subjunctive_present",
  "subjunctive_imperfect",
  "imperative",
];
const GOALS = [25, 50, 100];
const VERB_LIMITS = [100, 300, 500];
const DEFAULT_ANALYTICS_ENABLED = false;
const FEEDBACK_EMAIL = process.env.EXPO_PUBLIC_FEEDBACK_EMAIL ?? "";

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
  subjunctive_present: "subjuntiu present",
  subjunctive_imperfect: "subjuntiu imperfet",
  imperative: "imperatiu",
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

function getConjugation(verb, tense, person) {
  return verb.tenses?.[tense]?.[person] ?? "";
}

function getVerbRank(verb, index) {
  return typeof verb.rank === "number" ? verb.rank : index + 1;
}

function getFilteredVerbs(verbFilters, verbLimit) {
  return verbs.filter((verb, index) => {
    const regular = verb.regular !== false;
    if (regular && !verbFilters.regular) return false;
    if (!regular && !verbFilters.irregular) return false;
    const rank = getVerbRank(verb, index);
    if (rank > verbLimit) return false;
    return true;
  });
}

function getAvailablePrompts(
  filteredVerbs,
  enabledPersons,
  enabledTenses,
  lastKey,
) {
  const enabledPersonList = PERSONS.filter((person) => enabledPersons[person]);
  const enabledTenseList = TENSES.filter((tense) => enabledTenses[tense]);
  if (enabledPersonList.length === 0 || enabledTenseList.length === 0) return [];

  const prompts = [];
  for (const verb of filteredVerbs) {
    for (const tense of enabledTenseList) {
      for (const person of enabledPersonList) {
        const answer = getConjugation(verb, tense, person);
        if (!answer) continue;
        const key = `${verb.infinitive}-${person}-${tense}`;
        if (lastKey && key === lastKey) continue;
        prompts.push({ verb, person, tense, key });
      }
    }
  }
  return prompts;
}

function pickNextPrompt(
  enabledPersons,
  enabledTenses,
  verbFilters,
  verbLimit,
  lastKey,
) {
  const filteredVerbs = getFilteredVerbs(verbFilters, verbLimit);
  if (filteredVerbs.length === 0) return null;
  const prompts = getAvailablePrompts(
    filteredVerbs,
    enabledPersons,
    enabledTenses,
    lastKey,
  );
  if (prompts.length === 0) return null;
  return prompts[Math.floor(Math.random() * prompts.length)];
}

function hasAvailablePrompts(
  enabledPersons,
  enabledTenses,
  verbFilters,
  verbLimit,
) {
  const filteredVerbs = getFilteredVerbs(verbFilters, verbLimit);
  if (filteredVerbs.length === 0) return false;
  const prompts = getAvailablePrompts(
    filteredVerbs,
    enabledPersons,
    enabledTenses,
    null,
  );
  return prompts.length > 0;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPromptAllowed(
  prompt,
  enabledPersons,
  enabledTenses,
  verbFilters,
  verbLimit,
) {
  if (!prompt) return false;
  if (!enabledPersons[prompt.person]) return false;
  if (!enabledTenses[prompt.tense]) return false;
  const isRegular = prompt.verb.regular !== false;
  if (isRegular && !verbFilters.regular) return false;
  if (!isRegular && !verbFilters.irregular) return false;
  const verbIndex = verbs.findIndex(
    (verb) => verb.infinitive === prompt.verb.infinitive,
  );
  const rank = getVerbRank(prompt.verb, verbIndex === -1 ? 0 : verbIndex);
  if (rank > verbLimit) return false;
  const answer = getConjugation(prompt.verb, prompt.tense, prompt.person);
  if (!answer) return false;
  return true;
}

function BlinkingCaret({ height, color, style }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: 2,
          height,
          backgroundColor: color,
          marginLeft: 6,
          opacity,
        },
        style,
      ]}
    />
  );
}

function Confetti({ burstKey, big, colorPalette }) {
  const pieces = useMemo(() => {
    if (!burstKey) return [];
    const colors = colorPalette;
    const count = big ? 54 : 28;
    const minDistance = big ? 120 : 80;
    const maxDistance = big ? 220 : 140;
    return Array.from({ length: count }).map((_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const distance =
        minDistance + Math.random() * (maxDistance - minDistance);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance - (big ? 60 : 30);
      return {
        key: `${burstKey}-${index}`,
        color: colors[index % colors.length],
        rotate: `${Math.random() * 260}deg`,
        x,
        y,
        delay: Math.random() * (big ? 140 : 100),
      };
    });
  }, [burstKey, big, colorPalette]);

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.key} piece={piece} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 650,
      delay: piece.delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [piece.delay, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, piece.x],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, piece.y],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          backgroundColor: piece.color,
          opacity,
          transform: [
            { translateX },
            { translateY },
            { rotate: piece.rotate },
            { scale },
          ],
        },
      ]}
    />
  );
}

export default function App() {
  const inputRef = useRef(null);
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
    imperfect: false,
    future: false,
    conditional: false,
    subjunctive_present: false,
    subjunctive_imperfect: false,
    imperative: false,
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
  const [verbLimit, setVerbLimit] = useState(300);
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
  const [configError, setConfigError] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [showLastResult, setShowLastResult] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  const expectedAnswer = useMemo(() => {
    if (!currentPrompt) return "";
    return getConjugation(
      currentPrompt.verb,
      currentPrompt.tense,
      currentPrompt.person,
    );
  }, [currentPrompt]);

  useEffect(() => {
    initErrorTracking();
  }, []);

  useEffect(() => {
    if (!currentPrompt) {
      const next = pickNextPrompt(
        enabledPersons,
        enabledTenses,
        verbFilters,
        verbLimit,
        null,
      );
      if (next) {
        setConfigError(false);
        setCurrentPrompt(next);
      } else {
        setConfigError(true);
      }
    }
  }, [currentPrompt, enabledPersons, enabledTenses, verbFilters, verbLimit]);

  useEffect(() => {
    if (
      currentPrompt &&
      !isPromptAllowed(
        currentPrompt,
        enabledPersons,
        enabledTenses,
        verbFilters,
        verbLimit,
      )
    ) {
      setInputValue("");
      setHintedIndices(new Set());
      const next = pickNextPrompt(
        enabledPersons,
        enabledTenses,
        verbFilters,
        verbLimit,
        currentPrompt.key,
      );
      if (next) {
        setConfigError(false);
        setCurrentPrompt(next);
      } else {
        setConfigError(true);
      }
    }
  }, [currentPrompt, enabledPersons, enabledTenses, verbFilters, verbLimit]);

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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        trackEvent("session_end");
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!feedbackOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentPrompt, feedbackOpen]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem("conjugat_theme");
        if (storedTheme === "catalan") {
          setIsCatalanTheme(true);
        } else if (storedTheme === "default") {
          setIsCatalanTheme(false);
        } else {
          await AsyncStorage.setItem("conjugat_theme", "catalan");
        }

        const storedGoal = await AsyncStorage.getItem("conjugat_goal");
        const storedProgress = await AsyncStorage.getItem("conjugat_progress");
        const storedDate = await AsyncStorage.getItem("conjugat_date");
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
          await AsyncStorage.setItem("conjugat_date", getLocalDateKey());
          await AsyncStorage.setItem("conjugat_progress", "0");
        }

        const storedSettings = await AsyncStorage.getItem("conjugat_settings");
        if (storedSettings) {
          try {
            const parsed = JSON.parse(storedSettings);
            if (parsed.enabledPersons) {
              setEnabledPersons((prev) => ({
                ...prev,
                ...parsed.enabledPersons,
              }));
            }
            if (parsed.enabledTenses) {
              setEnabledTenses((prev) => ({
                ...prev,
                ...parsed.enabledTenses,
              }));
            }
            if (parsed.verbFilters) setVerbFilters(parsed.verbFilters);
            if (parsed.verbLimit && VERB_LIMITS.includes(parsed.verbLimit)) {
              setVerbLimit(parsed.verbLimit);
            }
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
      } catch {
        // ignore storage errors
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      "conjugat_theme",
      isCatalanTheme ? "catalan" : "default",
    ).catch(() => null);
    trackEvent("settings_changed", { setting: "theme", value: isCatalanTheme });
  }, [isCatalanTheme]);

  useEffect(() => {
    AsyncStorage.setItem(
      "conjugat_settings",
      JSON.stringify({
        enabledPersons,
        enabledTenses,
        verbFilters,
        verbLimit,
        analyticsEnabled,
      }),
    ).catch(() => null);
  }, [enabledPersons, enabledTenses, verbFilters, verbLimit, analyticsEnabled]);

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
      verb_limit: verbLimit,
    });
  }, [
    dailyGoal,
    isCatalanTheme,
    verbFilters,
    enabledTenses,
    enabledPersons,
    verbLimit,
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
            AsyncStorage.setItem("conjugat_date", todayKey).catch(() => null);
            AsyncStorage.setItem("conjugat_progress", String(nextValue)).catch(
              () => null,
            );
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
          verbLimit,
          currentPrompt?.key,
        );
        setLastResult({
          verb: currentPrompt?.verb?.infinitive,
          translation: currentPrompt?.verb?.translation,
          person: currentPrompt?.person,
          tense: currentPrompt?.tense,
          answer: expectedAnswer,
        });
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

  const handleInputChange = (rawValue) => {
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
    AsyncStorage.setItem("conjugat_goal", String(goal)).catch(() => null);
    trackEvent("settings_changed", { setting: "daily_goal", value: goal });
  };

  const handleVerbLimitChange = (limit) => {
    setVerbLimit(limit);
    trackEvent("settings_changed", { setting: "verb_limit", value: limit });
  };

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
      const next = { ...prev, [person]: !prev[person] };
      if (!hasAvailablePrompts(next, enabledTenses, verbFilters, verbLimit)) {
        setConfigError(true);
        return prev;
      }
      setConfigError(false);
      return next;
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
      const next = { ...prev, [tense]: !prev[tense] };
      if (!hasAvailablePrompts(enabledPersons, next, verbFilters, verbLimit)) {
        setConfigError(true);
        return prev;
      }
      setConfigError(false);
      return next;
    });
    trackEvent("settings_changed", { setting: "tense", value: tense });
  };

  const toggleVerbFilter = (key) => {
    if (currentPrompt) {
      const isRegular = currentPrompt.verb.regular !== false;
      const wouldDisableCurrent =
        (key === "regular" && isRegular) ||
        (key === "irregular" && !isRegular);
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
      const next = { ...prev, [key]: !prev[key] };
      if (!hasAvailablePrompts(enabledPersons, enabledTenses, next, verbLimit)) {
        setConfigError(true);
        return prev;
      }
      setConfigError(false);
      return next;
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
    Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`);
  };

  if (!fontsLoaded || !currentPrompt) {
    return null;
  }

  const theme = isCatalanTheme ? catalanTheme : defaultTheme;

  return (
    <LinearGradient colors={theme.backgroundGradient} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, theme.cardShadow, theme.card]}
          >
            <Pressable onPress={handleTitleClick}>
              <Text style={[styles.title, theme.muted]}>Conjugat</Text>
            </Pressable>

            <View style={styles.prompt}
            >
              <Text style={[styles.infinitive, theme.ink]}>
                {currentPrompt.verb.infinitive} — {currentPrompt.verb.translation}
              </Text>
              <Text style={[styles.meta, theme.muted]}>
                {PERSON_LABELS[currentPrompt.person]} · {TENSE_LABELS[currentPrompt.tense]}
              </Text>
            </View>

            <Pressable onPress={() => inputRef.current?.focus()}>
              <View style={[styles.inputArea, theme.inputAreaBorder]}>
                <View style={styles.typedRow}>
                  {inputValue.length === 0 ? (
                    <View style={styles.placeholderRow}>
                      <BlinkingCaret
                        height={24}
                        color={theme.accentColor}
                        style={styles.idleCaret}
                      />
                      <Text style={[styles.placeholder, theme.placeholder]}>
                        Escriu la conjugació…
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.typedWrap}>
                      {inputValue.split("").map((char, index) => {
                        const expectedChar = expectedAnswer[index] ?? "";
                        const status = getStatus(
                          char,
                          expectedChar,
                          hintedIndices.has(index),
                        );
                        return (
                          <Text
                            key={`${char}-${index}`}
                            style={[styles.char, theme[status]]}
                          >
                            {char}
                          </Text>
                        );
                      })}
                      <BlinkingCaret height={28} color={theme.accentColor} />
                    </View>
                  )}
                </View>
                <TextInput
                  ref={inputRef}
                  style={[styles.ghostInput, theme.ink]}
                  value={inputValue}
                  onChangeText={handleInputChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!feedbackOpen}
                  accessibilityLabel="Type conjugation"
                  caretHidden
                />
              </View>
            </Pressable>

            {confettiBurst > 0 && (
              <Confetti
                burstKey={confettiBurst}
                big={confettiBig}
                colorPalette={theme.confettiColors}
              />
            )}

            <View style={styles.controls}>
              <Pressable style={[styles.hintButton, theme.hintButton]} onPress={handleHint}>
                <Text style={styles.hintButtonText}>Pista (Hint)</Text>
              </Pressable>
              {lastResult && (
                <Pressable
                  style={[styles.ghostButton, theme.ghostButton]}
                  onPress={() => setShowLastResult((prev) => !prev)}
                >
                  <Text style={[styles.ghostButtonText, theme.muted]}>
                    Mostra l'anterior
                  </Text>
                </Pressable>
              )}
            </View>

            {showLastResult && lastResult && (
              <View style={[styles.lastResult, theme.lastResult]}>
                <Text style={[styles.lastTitle, theme.ink]}>
                  {lastResult.verb} — {lastResult.translation}
                </Text>
                <Text style={[styles.lastMeta, theme.muted]}>
                  {PERSON_LABELS[lastResult.person]} · {TENSE_LABELS[lastResult.tense]}
                </Text>
                <Text style={[styles.lastAnswer, theme.ink]}>{lastResult.answer}</Text>
              </View>
            )}

            <Pressable
              style={styles.settingsHeader}
              onPress={() => setSettingsOpen((prev) => !prev)}
            >
              <Text style={[styles.settingsHeaderText, theme.muted]}>
                Configuració
              </Text>
              <Text style={[styles.settingsHeaderIcon, theme.muted]}>
                {settingsOpen ? "▾" : "▸"}
              </Text>
            </Pressable>

            {settingsOpen && (
              <View style={styles.settingsPanel}>
                {configError && (
                  <Text style={[styles.settingsWarning, theme.warning]}>
                    No hi ha cap combinació disponible per aquesta configuració.
                  </Text>
                )}

                <View style={styles.settingsBlock}>
                  <Text style={[styles.settingsTitle, theme.muted]}>Persones</Text>
                  <View style={styles.pillRow}>
                    {PERSONS.map((person) => (
                      <Pressable
                        key={person}
                        style={[
                          styles.pill,
                          enabledPersons[person]
                            ? theme.pillOn
                            : theme.pillOff,
                        ]}
                        onPress={() => togglePerson(person)}
                      >
                        <Text style={[styles.pillText, theme.pillText]}>
                          {PERSON_SETTINGS_LABELS[person]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.settingsBlock}>
                  <Text style={[styles.settingsTitle, theme.muted]}>Temps</Text>
                  <View style={styles.pillRow}>
                    {TENSES.map((tense) => (
                      <Pressable
                        key={tense}
                        style={[
                          styles.pill,
                          enabledTenses[tense]
                            ? theme.pillOn
                            : theme.pillOff,
                        ]}
                        onPress={() => toggleTense(tense)}
                      >
                        <Text style={[styles.pillText, theme.pillText]}>
                          {TENSE_LABELS[tense]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.settingsBlock}>
                  <Text style={[styles.settingsTitle, theme.muted]}>Tipus de verbs</Text>
                  <View style={styles.pillRow}>
                    {[
                      { key: "regular", label: "regular" },
                      { key: "irregular", label: "irregular" },
                    ].map((item) => (
                      <Pressable
                        key={item.key}
                        style={[
                          styles.pill,
                          verbFilters[item.key]
                            ? theme.pillOn
                            : theme.pillOff,
                        ]}
                        onPress={() => toggleVerbFilter(item.key)}
                      >
                        <Text style={[styles.pillText, theme.pillText]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.settingsBlock}>
                  <Text style={[styles.settingsTitle, theme.muted]}>Nombre de verbs</Text>
                  <View style={styles.pillRow}>
                    {VERB_LIMITS.map((limit) => (
                      <Pressable
                        key={limit}
                        style={[
                          styles.goalPill,
                          verbLimit === limit
                            ? theme.pillOn
                            : theme.pillOff,
                        ]}
                        onPress={() => handleVerbLimitChange(limit)}
                      >
                        <Text style={[styles.pillText, theme.pillText]}>
                          {limit}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.settingsBlock}>
                  <Text style={[styles.settingsTitle, theme.muted]}>Objectiu diari</Text>
                  <View style={styles.pillRow}>
                    {GOALS.map((goal) => (
                      <Pressable
                        key={goal}
                        style={[
                          styles.goalPill,
                          dailyGoal === goal
                            ? theme.pillOn
                            : theme.pillOff,
                        ]}
                        onPress={() => handleGoalChange(goal)}
                      >
                        <Text style={[styles.pillText, theme.pillText]}>
                          {goal}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.settingsBlock}>
                  <Text style={[styles.settingsTitle, theme.muted]}>Tema</Text>
                  <Pressable
                    style={[
                      styles.goalPill,
                      isCatalanTheme ? theme.pillOn : theme.pillOff,
                    ]}
                    onPress={() => setIsCatalanTheme((prev) => !prev)}
                  >
                    <Text style={[styles.pillText, theme.pillText]}>
                      Colors catalans
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={[styles.progressInline, styles.progressBottom, theme.divider]}>
              <Text style={[styles.progressLabel, theme.muted]}>Objectiu diari</Text>
              <Text style={[styles.progressValue, theme.muted]}>
                {Math.min(dailyProgress, dailyGoal)} / {dailyGoal}
              </Text>
              <View style={[styles.goalBar, theme.goalBar]}>
                <View
                  style={[
                    styles.goalFill,
                    theme.goalFill,
                    { width: `${Math.min(100, (dailyProgress / dailyGoal) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.footnote}>
            <Text style={[styles.footnoteText, theme.muted]}>
              Conjugat · © 2026 · fet per Daan
            </Text>
            {easterEggVisible && (
              <Text style={[styles.footnoteText, theme.accent]}>
                · Visca Catalunya lliure.
              </Text>
            )}
            <Pressable onPress={() => setFeedbackOpen(true)}>
              <Text style={[styles.feedbackLink, theme.accent]}>
                Hi ha un error? Fes-m'ho saber
              </Text>
            </Pressable>
          </View>

          {feedbackOpen && (
            <View style={styles.modalBackdrop}>
              <View style={[styles.modal, theme.card, theme.cardShadow]}>
                <Text style={[styles.modalTitle, theme.ink]}>Explica l'error</Text>
                <Text style={[styles.modalText, theme.muted]}>
                  Envia'ns un correu amb aquest text.
                </Text>
                <TextInput
                  style={[styles.modalInput, theme.modalInput]}
                  multiline
                  numberOfLines={5}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder="Quin verb, quina forma, i què hauria de dir?"
                  placeholderTextColor={theme.placeholderColor}
                />
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalButton, theme.modalButtonOff]}
                    onPress={() => setFeedbackOpen(false)}
                  >
                    <Text style={styles.modalButtonText}>Tanca</Text>
                  </Pressable>
                  {FEEDBACK_EMAIL ? (
                    <Pressable
                      style={[styles.modalButton, theme.modalButtonOn]}
                      onPress={handleSendFeedback}
                    >
                      <Text style={[styles.modalButtonText, styles.modalButtonTextOn]}>
                        Envia per correu
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  container: {
    padding: 24,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 680,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
  },
  title: {
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 3.6,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  prompt: {
    marginTop: 20,
    marginBottom: 20,
  },
  infinitive: {
    fontSize: 30,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  meta: {
    fontSize: 16,
    marginTop: 6,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  inputArea: {
    position: "relative",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 2,
    minHeight: 72,
    justifyContent: "center",
  },
  typedRow: {
    minHeight: 36,
  },
  typedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2,
  },
  placeholderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  placeholder: {
    fontSize: 18,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  idleCaret: {
    marginLeft: 0,
    marginRight: 6,
  },
  ghostInput: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    color: "transparent",
    backgroundColor: "transparent",
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 32,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 1.2,
  },
  char: {
    fontSize: 32,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 1.2,
  },
  controls: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  hintButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  hintButtonText: {
    color: "#fff",
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 12,
  },
  ghostButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  ghostButtonText: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  lastResult: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
  },
  lastTitle: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  lastMeta: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  lastAnswer: {
    fontSize: 18,
    marginTop: 6,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  settingsHeader: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsHeaderText: {
    fontSize: 12,
    letterSpacing: 2.8,
    textTransform: "uppercase",
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  settingsHeaderIcon: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  settingsPanel: {
    marginTop: 12,
  },
  settingsWarning: {
    marginBottom: 10,
    padding: 8,
    borderRadius: 10,
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  settingsBlock: {
    marginBottom: 14,
  },
  settingsTitle: {
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    marginBottom: 8,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  goalPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  progressInline: {
    marginTop: 14,
    display: "flex",
  },
  progressBottom: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  progressLabel: {
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  progressValue: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  goalBar: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  goalFill: {
    height: "100%",
  },
  footnote: {
    marginTop: 18,
    alignItems: "center",
    gap: 6,
  },
  footnoteText: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  feedbackLink: {
    fontSize: 12,
    textDecorationLine: "underline",
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  modalBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(18, 18, 18, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_600SemiBold",
    marginBottom: 6,
  },
  modalText: {
    fontSize: 13,
    marginBottom: 12,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minHeight: 100,
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  modalActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalButton: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalButtonText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  modalButtonTextOn: {
    color: "#fff",
  },
  confettiLayer: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  confettiPiece: {
    position: "absolute",
    width: 10,
    height: 6,
    borderRadius: 3,
  },
});

const defaultTheme = {
  backgroundGradient: ["#fff6e1", "#f5f2ea", "#efe8d6"],
  card: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  cardShadow: {
    shadowColor: "#202020",
    shadowOpacity: 0.12,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  inputAreaBorder: {
    borderColor: "rgba(15, 118, 110, 0.2)",
    backgroundColor: "#fdfbf5",
  },
  divider: {
    borderTopColor: "rgba(0, 0, 0, 0.06)",
  },
  goalBar: {
    backgroundColor: "#efe6d7",
  },
  goalFill: {
    backgroundColor: "#0f766e",
  },
  pillOn: {
    backgroundColor: "rgba(15, 118, 110, 0.12)",
    borderColor: "rgba(15, 118, 110, 0.3)",
  },
  pillOff: {
    backgroundColor: "#f4efe6",
    borderColor: "rgba(0, 0, 0, 0)",
  },
  pillText: {
    color: "#1a1a1a",
  },
  lastResult: {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  ghostButton: {
    borderColor: "rgba(0, 0, 0, 0.15)",
  },
  hintButton: {
    backgroundColor: "#0f766e",
  },
  warning: {
    backgroundColor: "rgba(198, 55, 45, 0.12)",
    color: "#c6372d",
  },
  modalInput: {
    borderColor: "rgba(0, 0, 0, 0.1)",
    color: "#1a1a1a",
  },
  modalButtonOff: {
    backgroundColor: "#f4efe6",
  },
  modalButtonOn: {
    backgroundColor: "#0f766e",
  },
  accent: {
    color: "#0f766e",
  },
  ink: {
    color: "#1a1a1a",
  },
  muted: {
    color: "#5c5a55",
  },
  placeholder: {
    color: "#c4b8a6",
  },
  placeholderColor: "#c4b8a6",
  accentColor: "#0f766e",
  green: { color: "#1f8b4c" },
  yellow: { color: "#c88b00" },
  red: { color: "#c6372d" },
  confettiColors: ["#1f8b4c", "#c88b00", "#c9252d", "#0f766e", "#f2c53a"],
};

const catalanTheme = {
  backgroundGradient: ["#f3b21d", "#f2c53a", "#f7e2a2", "#f8f1dd"],
  card: {
    backgroundColor: "#fff9ef",
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  cardShadow: {
    shadowColor: "#460e11",
    shadowOpacity: 0.18,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  inputAreaBorder: {
    borderColor: "rgba(201, 37, 45, 0.2)",
    backgroundColor: "#fffdfa",
  },
  divider: {
    borderTopColor: "rgba(0, 0, 0, 0.06)",
  },
  goalBar: {
    backgroundColor: "#efe6d7",
  },
  goalFill: {
    backgroundColor: "#c9252d",
  },
  pillOn: {
    backgroundColor: "rgba(201, 37, 45, 0.16)",
    borderColor: "rgba(201, 37, 45, 0.3)",
  },
  pillOff: {
    backgroundColor: "#f4efe6",
    borderColor: "rgba(0, 0, 0, 0)",
  },
  pillText: {
    color: "#1b1b1b",
  },
  lastResult: {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  ghostButton: {
    borderColor: "rgba(0, 0, 0, 0.15)",
  },
  hintButton: {
    backgroundColor: "#c9252d",
  },
  warning: {
    backgroundColor: "rgba(198, 55, 45, 0.12)",
    color: "#c6372d",
  },
  modalInput: {
    borderColor: "rgba(0, 0, 0, 0.1)",
    color: "#1b1b1b",
  },
  modalButtonOff: {
    backgroundColor: "#f4efe6",
  },
  modalButtonOn: {
    backgroundColor: "#c9252d",
  },
  accent: {
    color: "#c9252d",
  },
  ink: {
    color: "#1b1b1b",
  },
  muted: {
    color: "#6b5c4a",
  },
  placeholder: {
    color: "#c4b8a6",
  },
  placeholderColor: "#c4b8a6",
  accentColor: "#c9252d",
  green: { color: "#1f8b4c" },
  yellow: { color: "#c88b00" },
  red: { color: "#c6372d" },
  confettiColors: ["#1f8b4c", "#c88b00", "#c9252d", "#0f766e", "#f2c53a"],
};
