const APP_STORAGE_KEY = "nutrition-tracker-app-v1";
const LEGACY_DAY_STORAGE_KEY = "nutrition-tracker-poc-day";

const MEALS = [
  { key: "breakfast", label: "Breakfast", kicker: "Morning" },
  { key: "lunch", label: "Lunch", kicker: "Midday" },
  { key: "dinner", label: "Dinner", kicker: "Evening" },
  { key: "snacks", label: "Snacks", kicker: "Between meals" }
];

const GOALS = {
  calories: 2200,
  protein: 140,
  carbs: 240,
  fat: 75,
  fiber: 28
};

const NUTRIENTS = {
  ENERC_KCAL: { label: "Calories", unit: "kcal", goal: GOALS.calories },
  PROCNT: { label: "Protein", unit: "g", goal: GOALS.protein },
  CHOCDF: { label: "Carbs", unit: "g", goal: GOALS.carbs },
  FAT: { label: "Fat", unit: "g", goal: GOALS.fat },
  FIBTG: { label: "Fiber", unit: "g", goal: GOALS.fiber },
  SUGAR: { label: "Sugar", unit: "g", goal: 60 },
  NA: { label: "Sodium", unit: "mg", goal: 2300 }
};

const DASHBOARD_PROGRESS = ["PROCNT", "CHOCDF", "FAT", "FIBTG"];
const RESULT_MACROS = ["ENERC_KCAL", "PROCNT", "CHOCDF", "FAT"];
const PHOTO_UPLOAD_TARGET_MAX_BYTES = 3_500_000;
const PHOTO_UPLOAD_ATTEMPTS = [
  { maxDimension: 1600, quality: 0.82 },
  { maxDimension: 1280, quality: 0.74 },
  { maxDimension: 1024, quality: 0.66 }
];
const BARCODE_IMAGE_PREP = { maxDimension: 2200, quality: 0.9 };

const state = {
  app: loadAppState(),
  selectedDate: todayKey(),
  selectedMeal: "breakfast",
  activeView: "dashboard",
  activeFinderTab: "search",
  results: [],
  photoDataUrl: "",
  scanner: {
    instance: null,
    isRunning: false,
    lastCode: "",
    stopPromise: null
  }
};

const elements = {
  bottomNavItems: [...document.querySelectorAll(".nav-item")],
  calorieRing: document.querySelector("#calorieRing"),
  calorieTargetText: document.querySelector("#calorieTargetText"),
  calorieValue: document.querySelector("#calorieValue"),
  barcodeForm: document.querySelector("#barcodeForm"),
  barcodeCameraInput: document.querySelector("#barcodeCameraInput"),
  barcodeImageInput: document.querySelector("#barcodeImageInput"),
  barcodeSupportText: document.querySelector("#barcodeSupportText"),
  barcodeInput: document.querySelector("#barcodeInput"),
  barcodeScannerRegion: document.querySelector("#barcodeScannerRegion"),
  clearDayButton: document.querySelector("#clearDayButton"),
  errorHost: document.querySelector("#errorHost"),
  favoritesList: document.querySelector("#favoritesList"),
  finderPanels: [...document.querySelectorAll(".finder-panel")],
  finderTabs: [...document.querySelectorAll(".finder-tab")],
  heroHeadline: document.querySelector("#heroHeadline"),
  heroSubcopy: document.querySelector("#heroSubcopy"),
  historyList: document.querySelector("#historyList"),
  historyStats: document.querySelector("#historyStats"),
  macroProgressList: document.querySelector("#macroProgressList"),
  mealGrid: document.querySelector("#mealGrid"),
  mealSegmented: document.querySelector("#mealSegmented"),
  mealCardTemplate: document.querySelector("#mealCardTemplate"),
  openAddButton: document.querySelector("#openAddButton"),
  photoForm: document.querySelector("#photoForm"),
  photoCameraInput: document.querySelector("#photoCameraInput"),
  photoLibraryInput: document.querySelector("#photoLibraryInput"),
  photoPreview: document.querySelector("#photoPreview"),
  prevDayButton: document.querySelector("#prevDayButton"),
  nextDayButton: document.querySelector("#nextDayButton"),
  quickScanButton: document.querySelector("#quickScanButton"),
  quickSearchButton: document.querySelector("#quickSearchButton"),
  recentEntries: document.querySelector("#recentEntries"),
  resultCardTemplate: document.querySelector("#resultCardTemplate"),
  results: document.querySelector("#results"),
  resultsMeta: document.querySelector("#resultsMeta"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  selectedMealLabel: document.querySelector("#selectedMealLabel"),
  startScannerButton: document.querySelector("#startScannerButton"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  stopScannerButton: document.querySelector("#stopScannerButton"),
  todayButton: document.querySelector("#todayButton"),
  viewPanels: [...document.querySelectorAll(".view")]
};

boot();

async function boot() {
  ensureDay(state.selectedDate);
  buildMealSegmentedControl();
  bindEvents();
  updateBarcodeSupportState();
  renderApp();
  await loadHealth();
}

function bindEvents() {
  elements.bottomNavItems.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  });

  elements.finderTabs.forEach((button) => {
    button.addEventListener("click", () => {
      void switchFinderTab(button.dataset.tab);
    });
  });

  elements.openAddButton.addEventListener("click", () => {
    switchView("add");
    void switchFinderTab("search");
  });

  elements.quickSearchButton.addEventListener("click", () => {
    switchView("add");
    void switchFinderTab("search");
    elements.searchInput.focus();
  });

  elements.quickScanButton.addEventListener("click", () => {
    switchView("add");
    void switchFinderTab("barcode");
  });

  elements.prevDayButton.addEventListener("click", () => changeDay(-1));
  elements.nextDayButton.addEventListener("click", () => changeDay(1));
  elements.todayButton.addEventListener("click", () => {
    state.selectedDate = todayKey();
    ensureDay(state.selectedDate);
    renderApp();
  });

  elements.clearDayButton.addEventListener("click", () => {
    state.app.days[state.selectedDate] = createEmptyDay(state.selectedDate);
    persistAppState();
    renderApp();
  });

  elements.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = elements.searchInput.value.trim();
    if (!query) {
      return;
    }

    await runLookup({
      label: `Searching for "${query}"...`,
      handler: () => apiGet(`/api/search?q=${encodeURIComponent(query)}`)
    });
  });

  elements.barcodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const barcode = elements.barcodeInput.value.trim();
    if (!barcode) {
      return;
    }
    await lookupBarcode(barcode);
  });

  elements.barcodeImageInput.addEventListener("change", async (event) => {
    try {
      await handleBarcodeImageSelection(event.target.files?.[0]);
    } finally {
      event.target.value = "";
    }
  });

  elements.barcodeCameraInput.addEventListener("change", async (event) => {
    try {
      await handleBarcodeImageSelection(event.target.files?.[0]);
    } finally {
      event.target.value = "";
    }
  });

  elements.photoCameraInput.addEventListener("change", async (event) => {
    try {
      await handleFoodPhotoSelection(event.target.files?.[0]);
    } finally {
      event.target.value = "";
    }
  });

  elements.photoLibraryInput.addEventListener("change", async (event) => {
    try {
      await handleFoodPhotoSelection(event.target.files?.[0]);
    } finally {
      event.target.value = "";
    }
  });

  elements.photoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.photoDataUrl) {
      showError("Select a photo before running image analysis.");
      return;
    }

    await runLookup({
      label: "Analyzing photo with Edamam...",
      handler: () =>
        apiPost("/api/analyze-image", { image: state.photoDataUrl }).then((response) => ({
          items: response.item ? [response.item] : []
        }))
    });
  });

  elements.startScannerButton.addEventListener("click", startBarcodeScanner);
  elements.stopScannerButton.addEventListener("click", stopBarcodeScanner);
}

async function loadHealth() {
  try {
    const response = await apiGet("/api/health");
    if (response.hasEdamamCredentials) {
      elements.statusText.textContent = "API ready";
      elements.statusDot.classList.add("good");
    } else {
      elements.statusText.textContent = "Add Edamam keys to .env";
    }
  } catch (error) {
    elements.statusText.textContent = error.message;
  }
}

function buildMealSegmentedControl() {
  elements.mealSegmented.innerHTML = "";

  MEALS.forEach((meal) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "meal-segmented-button";
    button.textContent = meal.label;
    button.dataset.meal = meal.key;
    button.addEventListener("click", () => {
      state.selectedMeal = meal.key;
      renderMealSelection();
    });
    elements.mealSegmented.appendChild(button);
  });
}

function renderApp() {
  ensureDay(state.selectedDate);
  renderViewState();
  renderDateState();
  renderOverview();
  renderMeals();
  renderRecentEntries();
  renderFavorites();
  renderMealSelection();
  renderResults();
  renderHistory();
}

function renderViewState() {
  elements.viewPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.view === state.activeView);
  });

  elements.bottomNavItems.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === state.activeView);
  });
}

function renderDateState() {
  elements.selectedDateLabel.textContent = formatLongDate(state.selectedDate);
}

function renderOverview() {
  const day = getSelectedDay();
  const totals = calculateDayTotals(day);
  const calorieTotal = totals.ENERC_KCAL.quantity;
  const calorieGoal = NUTRIENTS.ENERC_KCAL.goal;
  const remaining = Math.max(calorieGoal - calorieTotal, 0);
  const ratio = clamp(calorieTotal / calorieGoal, 0, 1.25);

  elements.calorieValue.textContent = formatNumber(calorieTotal);
  elements.calorieTargetText.textContent = `${formatNumber(remaining)} remaining of ${calorieGoal}`;
  elements.calorieRing.style.width = `${Math.min(ratio, 1) * 100}%`;

  const mealCount = Object.values(day.meals).filter((entries) => entries.length > 0).length;
  if (calorieTotal === 0) {
    elements.heroHeadline.textContent = "Start logging your day.";
    elements.heroSubcopy.textContent =
      "Use search, barcode, or photo capture to build your meals and keep a clean daily view.";
  } else if (ratio < 0.7) {
    elements.heroHeadline.textContent = "You still have room for the rest of the day.";
    elements.heroSubcopy.textContent = `${mealCount} meal ${mealCount === 1 ? "bucket is" : "buckets are"} active so far.`;
  } else if (ratio <= 1) {
    elements.heroHeadline.textContent = "Your intake is tracking cleanly.";
    elements.heroSubcopy.textContent = "Macro progress is close to target and your meals are balanced.";
  } else {
    elements.heroHeadline.textContent = "You are over the current calorie target.";
    elements.heroSubcopy.textContent = "Check the meal breakdown below and adjust the next entry if needed.";
  }

  elements.macroProgressList.innerHTML = "";
  DASHBOARD_PROGRESS.forEach((key) => {
    const nutrient = totals[key];
    const goal = NUTRIENTS[key].goal;
    const percent = clamp(nutrient.quantity / goal, 0, 1);
    const row = document.createElement("article");
    row.className = "progress-row";
    row.innerHTML = `
      <div class="progress-row-header">
        <strong>${nutrient.label}</strong>
        <span>${formatNumber(nutrient.quantity)} / ${goal} ${nutrient.unit}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${percent * 100}%"></div>
      </div>
    `;
    elements.macroProgressList.appendChild(row);
  });
}

function renderMeals() {
  const day = getSelectedDay();
  elements.mealGrid.innerHTML = "";

  MEALS.forEach((meal) => {
    const entries = day.meals[meal.key];
    const totals = calculateEntryTotals(entries);
    const fragment = elements.mealCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".meal-panel");
    const kicker = fragment.querySelector(".meal-kicker");
    const title = fragment.querySelector(".meal-title");
    const button = fragment.querySelector(".meal-log-button");
    const calories = fragment.querySelector(".meal-calories");
    const macros = fragment.querySelector(".meal-macros");
    const preview = fragment.querySelector(".meal-items-preview");

    kicker.textContent = meal.kicker;
    title.textContent = meal.label;
    calories.textContent = `${formatNumber(totals.ENERC_KCAL.quantity)} kcal`;

    ["PROCNT", "CHOCDF", "FAT"].forEach((key) => {
      const pill = document.createElement("span");
      pill.className = "macro-pill";
      pill.textContent = `${NUTRIENTS[key].label} ${formatNumber(totals[key].quantity)}${NUTRIENTS[key].unit}`;
      macros.appendChild(pill);
    });

    if (!entries.length) {
      preview.className = "meal-items-preview empty-state";
      preview.textContent = "No items logged yet.";
    } else {
      preview.className = "meal-items-preview";
      entries.slice(-2).reverse().forEach((entry) => {
        const item = document.createElement("div");
        item.className = "meal-preview-item";
        item.innerHTML = `
          <span>${escapeHtml(entry.label)}</span>
          <strong>${formatNumber(entry.calories)} kcal</strong>
        `;
        preview.appendChild(item);
      });
    }

    button.addEventListener("click", () => {
      state.selectedMeal = meal.key;
      renderMealSelection();
      switchView("add");
      void switchFinderTab("search");
    });

    elements.mealGrid.appendChild(card);
  });
}

function renderRecentEntries() {
  const entries = getSelectedDayEntries().slice(0, 5);
  if (!entries.length) {
    elements.recentEntries.className = "stack-list empty-state";
    elements.recentEntries.textContent = "No foods logged yet.";
    return;
  }

  elements.recentEntries.className = "stack-list";
  elements.recentEntries.innerHTML = entries
    .map(
      (entry) => `
        <article class="recent-entry">
          <div>
            <strong>${escapeHtml(entry.label)}</strong>
            <div class="entry-line-meta">${escapeHtml(getMealLabel(entry.mealKey))} | ${formatTime(entry.addedAt)}</div>
          </div>
          <strong>${formatNumber(entry.calories)} kcal</strong>
        </article>
      `
    )
    .join("");
}

function renderFavorites() {
  const favorites = getFavoriteFoods();
  if (!favorites.length) {
    elements.favoritesList.className = "quick-food-list empty-state";
    elements.favoritesList.textContent = "Log a few foods to build shortcuts.";
    return;
  }

  elements.favoritesList.className = "quick-food-list";
  elements.favoritesList.innerHTML = "";

  favorites.forEach((favorite) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-food-button";
    button.innerHTML = `
      <div>
        <strong>${escapeHtml(favorite.label)}</strong>
        <span class="microcopy">${favorite.count} saves</span>
      </div>
      <strong>${formatNumber(favorite.calories)} kcal</strong>
    `;
    button.addEventListener("click", () => {
      addEntryToMeal({
        label: favorite.label,
        brand: favorite.brand,
        image: favorite.image,
        quantity: favorite.quantity,
        measureLabel: favorite.measureLabel,
        calories: favorite.calories,
        totalWeight: favorite.totalWeight,
        nutrients: favorite.nutrients
      });
      switchView("dashboard");
    });
    elements.favoritesList.appendChild(button);
  });
}

function renderMealSelection() {
  const meal = MEALS.find((item) => item.key === state.selectedMeal);
  elements.selectedMealLabel.textContent = meal?.label || "Breakfast";

  [...elements.mealSegmented.querySelectorAll(".meal-segmented-button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.meal === state.selectedMeal);
  });
}

function renderResults() {
  elements.results.innerHTML = "";

  if (!state.results.length) {
    elements.results.className = "results-list empty-state";
    elements.results.textContent = "No items yet.";
    return;
  }

  elements.results.className = "results-list";

  state.results.forEach((item) => {
    const fragment = elements.resultCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".result-item");
    const media = fragment.querySelector(".result-media");
    const title = fragment.querySelector(".result-title");
    const subtitle = fragment.querySelector(".result-subtitle");
    const macroWrap = fragment.querySelector(".result-macros");
    const form = fragment.querySelector(".result-form");
    const measureSelect = form.querySelector('select[name="measure"]');
    const quantityInput = form.querySelector('input[name="quantity"]');

    title.textContent = item.label;
    subtitle.textContent = [item.brand, item.category].filter(Boolean).join(" | ") || "Edamam match";

    if (item.image) {
      media.innerHTML = `<img src="${item.image}" alt="${escapeHtml(item.label)}" />`;
    } else {
      media.innerHTML = `<div class="photo-preview">No image</div>`;
    }

    RESULT_MACROS.forEach((key) => {
      const nutrient = (item.nutrients || item.nutrientsPer100g || baseNutrients())[key];
      const stat = document.createElement("div");
      stat.className = "macro-stat";
      stat.innerHTML = `
        <span>${nutrient.label}</span>
        <strong>${formatNumber(nutrient.quantity)} ${nutrient.unit}</strong>
      `;
      macroWrap.appendChild(stat);
    });

    const measures = item.measures?.length
      ? item.measures
      : [{ label: item.measureLabel || "Serving", uri: "", weight: null }];

    measures.forEach((measure) => {
      const option = document.createElement("option");
      option.value = measure.uri || measure.label;
      option.textContent = measure.weight
        ? `${measure.label} (${formatNumber(measure.weight)} g)`
        : measure.label;
      option.dataset.label = measure.label;
      measureSelect.appendChild(option);
    });

    const selectedMeasure = item.defaultMeasure?.uri || item.measureLabel || measureSelect.value;
    if (selectedMeasure) {
      measureSelect.value = selectedMeasure;
    }

    if (item.quantity) {
      quantityInput.value = item.quantity;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if ((item.isResolved || !item.measures?.length) && item.nutrients) {
        addEntryToMeal(item);
        switchView("dashboard");
        return;
      }

      const selectedOption = measureSelect.selectedOptions[0];
      const payload = {
        foodId: item.foodId,
        label: item.label,
        brand: item.brand,
        image: item.image,
        quantity: Number(quantityInput.value || 1),
        measureURI: measureSelect.value,
        measureLabel: selectedOption?.dataset.label || selectedOption?.textContent || "Serving"
      };

      try {
        const response = await apiPost("/api/nutrition", payload);
        addEntryToMeal(response.item);
        switchView("dashboard");
      } catch (error) {
        showError(error.message);
      }
    });

    elements.results.appendChild(card);
  });
}

function renderHistory() {
  const days = getHistoryDays();
  renderHistoryStats(days);

  if (!days.length) {
    elements.historyList.className = "history-list empty-state";
    elements.historyList.textContent = "No history yet.";
    return;
  }

  elements.historyList.className = "history-list";
  elements.historyList.innerHTML = "";

  days.forEach(({ date, totals }) => {
    const row = document.createElement("article");
    row.className = "history-day";
    row.innerHTML = `
      <button type="button">
        <div>
          <strong>${formatHistoryDate(date)}</strong>
          <div class="history-subcopy">${formatNumber(totals.PROCNT.quantity)}g protein | ${formatNumber(totals.FAT.quantity)}g fat</div>
        </div>
        <strong>${formatNumber(totals.ENERC_KCAL.quantity)} kcal</strong>
      </button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      state.selectedDate = date;
      ensureDay(date);
      switchView("dashboard");
      renderApp();
    });
    elements.historyList.appendChild(row);
  });
}

function renderHistoryStats(days) {
  elements.historyStats.innerHTML = "";

  const activeDays = days.filter((day) => day.totals.ENERC_KCAL.quantity > 0);
  const avgCalories = activeDays.length
    ? activeDays.reduce((sum, day) => sum + day.totals.ENERC_KCAL.quantity, 0) / activeDays.length
    : 0;
  const avgProtein = activeDays.length
    ? activeDays.reduce((sum, day) => sum + day.totals.PROCNT.quantity, 0) / activeDays.length
    : 0;
  const bestDay = [...days].sort((left, right) => right.totals.PROCNT.quantity - left.totals.PROCNT.quantity)[0];

  [
    { label: "Active days", value: String(activeDays.length) },
    { label: "Avg calories", value: `${formatNumber(avgCalories)} kcal` },
    {
      label: "Best protein day",
      value: bestDay ? `${formatShortDate(bestDay.date)} ${formatNumber(bestDay.totals.PROCNT.quantity)}g` : "None"
    }
  ].forEach((stat) => {
    const item = document.createElement("article");
    item.className = "history-stat";
    item.innerHTML = `
      <strong>${stat.value}</strong>
      <span class="microcopy">${stat.label}</span>
    `;
    elements.historyStats.appendChild(item);
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  renderViewState();
}

async function switchFinderTab(tabName) {
  state.activeFinderTab = tabName;
  elements.finderTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  elements.finderPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });

  if (tabName !== "barcode") {
    await stopBarcodeScanner();
  }
}

function changeDay(offset) {
  const base = new Date(`${state.selectedDate}T00:00:00`);
  base.setDate(base.getDate() + offset);
  state.selectedDate = dateKey(base);
  ensureDay(state.selectedDate);
  renderApp();
}

async function lookupBarcode(barcode) {
  await runLookup({
    label: `Looking up barcode ${barcode}...`,
    handler: () => apiGet(`/api/barcode?upc=${encodeURIComponent(barcode)}`)
  });
}

async function handleFoodPhotoSelection(file) {
  clearError();

  if (!file) {
    return;
  }

  if (!String(file.type || "").startsWith("image/")) {
    state.photoDataUrl = "";
    elements.photoPreview.textContent = "No photo selected";
    showError("Please select an image file.");
    return;
  }

  try {
    state.photoDataUrl = await buildOptimizedPhotoDataUrl(file);
    elements.photoPreview.innerHTML = `<img src="${state.photoDataUrl}" alt="Selected food preview" />`;
    elements.resultsMeta.textContent = "Photo ready. Tap Analyze photo to continue.";
  } catch (error) {
    state.photoDataUrl = "";
    elements.photoPreview.textContent = "No photo selected";
    showError(error.message || "Unable to load that photo. Try another image.");
  }
}

async function handleBarcodeImageSelection(file) {
  clearError();

  if (!file) {
    return;
  }

  if (!hasScannerLibrary()) {
    showError("The barcode scanner library is not available yet. Refresh the page and try again.");
    return;
  }

  try {
    await stopBarcodeScanner();
    elements.resultsMeta.textContent = `Scanning barcode from ${file.name}...`;
    const preparedFile = await buildScannerReadyImageFile(file);
    const code = await detectBarcodeFromFile(preparedFile);
    if (!code) {
      showError("No barcode was detected in that image. Try a sharper photo or use manual entry.");
      elements.resultsMeta.textContent = "No barcode found in the selected image.";
      return;
    }

    elements.barcodeInput.value = code;
    await lookupBarcode(code);
  } catch (error) {
    showError(error.message || "Unable to scan a barcode from that image.");
  }
}

async function runLookup({ label, handler }) {
  clearError();
  elements.resultsMeta.textContent = label;

  try {
    const response = await handler();
    state.results = response.items || [];
    renderResults();
    elements.resultsMeta.textContent = state.results.length
      ? `${state.results.length} match${state.results.length === 1 ? "" : "es"} found`
      : "No matches returned.";
  } catch (error) {
    state.results = [];
    renderResults();
    showError(error.message);
    elements.resultsMeta.textContent = "Lookup failed.";
  }
}

function addEntryToMeal(item) {
  const day = getSelectedDay();
  const entry = {
    id: crypto.randomUUID(),
    mealKey: state.selectedMeal,
    addedAt: new Date().toISOString(),
    label: item.label,
    brand: item.brand || "",
    image: item.image || "",
    quantity: item.quantity || 1,
    measureLabel: item.measureLabel || "Serving",
    calories: Number(item.calories || item.nutrients?.ENERC_KCAL?.quantity || 0),
    totalWeight: Number(item.totalWeight || 0),
    nutrients: item.nutrients || baseNutrients()
  };

  day.meals[state.selectedMeal].push(entry);
  persistAppState();
  renderApp();
}

function ensureDay(date) {
  if (!state.app.days[date]) {
    state.app.days[date] = createEmptyDay(date);
    persistAppState();
  }
}

function getSelectedDay() {
  ensureDay(state.selectedDate);
  return state.app.days[state.selectedDate];
}

function getSelectedDayEntries() {
  return Object.entries(getSelectedDay().meals)
    .flatMap(([mealKey, entries]) => entries.map((entry) => ({ ...entry, mealKey })))
    .sort((left, right) => new Date(right.addedAt) - new Date(left.addedAt));
}

function getHistoryDays() {
  const days = [];
  const today = new Date(`${todayKey()}T00:00:00`);

  for (let index = 0; index < 7; index += 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - index);
    const key = dateKey(current);
    const day = state.app.days[key] || createEmptyDay(key);
    days.push({
      date: key,
      totals: calculateDayTotals(day)
    });
  }

  return days;
}

function getFavoriteFoods() {
  const map = new Map();

  Object.values(state.app.days).forEach((day) => {
    Object.values(day.meals).flat().forEach((entry) => {
      const key = `${entry.label}|${entry.brand}|${entry.measureLabel}`;
      const existing = map.get(key) || {
        count: 0,
        label: entry.label,
        brand: entry.brand,
        image: entry.image,
        quantity: entry.quantity,
        measureLabel: entry.measureLabel,
        calories: entry.calories,
        totalWeight: entry.totalWeight,
        nutrients: entry.nutrients
      };
      existing.count += 1;
      existing.calories = entry.calories;
      existing.nutrients = entry.nutrients;
      map.set(key, existing);
    });
  });

  return [...map.values()].sort((left, right) => right.count - left.count).slice(0, 4);
}

function calculateDayTotals(day) {
  return calculateEntryTotals(Object.values(day.meals).flat());
}

function calculateEntryTotals(entries) {
  const totals = baseNutrients();

  entries.forEach((entry) => {
    Object.keys(NUTRIENTS).forEach((key) => {
      const quantity =
        Number(entry.nutrients?.[key]?.quantity || 0) ||
        (key === "ENERC_KCAL" ? Number(entry.calories || 0) : 0);
      totals[key].quantity += quantity;
    });
  });

  Object.keys(totals).forEach((key) => {
    totals[key].quantity = round1(totals[key].quantity);
  });

  return totals;
}

function baseNutrients() {
  return Object.fromEntries(
    Object.entries(NUTRIENTS).map(([key, nutrient]) => [
      key,
      { label: nutrient.label, unit: nutrient.unit, quantity: 0 }
    ])
  );
}

async function startBarcodeScanner() {
  clearError();
  if (!hasScannerLibrary()) {
    showError("The barcode scanner library did not load. Refresh the page and try again.");
    return;
  }

  try {
    if (state.scanner.stopPromise) {
      await state.scanner.stopPromise;
    }

    if (state.scanner.isRunning) {
      return;
    }

    const scanner = getScannerInstance();
    const preferredCamera = await pickPreferredCamera();
    elements.barcodeSupportText.textContent =
      "Camera active. Fill most of the frame with the barcode and move a little closer or farther away until it snaps in.";
    await scanner.start(
      preferredCamera?.id ? preferredCamera.id : { facingMode: "environment" },
      {
        fps: 8,
        aspectRatio: 1.7777778,
        formatsToSupport: barcodeFormats(),
        rememberLastUsedCamera: true
      },
      async (decodedText) => {
        if (!decodedText || decodedText === state.scanner.lastCode) {
          return;
        }

        state.scanner.lastCode = decodedText;
        elements.barcodeInput.value = decodedText;
        await stopBarcodeScanner();
        await lookupBarcode(decodedText);
      },
      () => {}
    );

    state.scanner.isRunning = true;
  } catch (error) {
    updateBarcodeSupportState();
    showError(error.message || "Unable to start barcode scanner.");
  }
}

async function stopBarcodeScanner() {
  if (state.scanner.stopPromise) {
    await state.scanner.stopPromise;
    return;
  }

  if (!state.scanner.instance || !state.scanner.isRunning) {
    renderScannerIdleState();
    updateBarcodeSupportState();
    return;
  }

  const scanner = state.scanner.instance;
  state.scanner.isRunning = false;

  state.scanner.stopPromise = (async () => {
    try {
      await scanner.stop();
      await scanner.clear();
    } catch {
      // The scanner can already be stopped if the tab was backgrounded.
    } finally {
      state.scanner.lastCode = "";
      renderScannerIdleState();
      updateBarcodeSupportState();
    }
  })();

  try {
    await state.scanner.stopPromise;
  } finally {
    state.scanner.stopPromise = null;
  }
}

function showError(message) {
  clearError();
  const banner = document.createElement("div");
  banner.className = "error-banner";
  banner.id = "errorBanner";
  banner.textContent = message;
  elements.errorHost.appendChild(banner);
}

function clearError() {
  elements.errorHost.querySelector("#errorBanner")?.remove();
}

async function apiGet(url) {
  const response = await fetch(url);
  return handleResponse(response);
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return handleResponse(response);
}

async function handleResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const expectsJson = contentType.includes("application/json");
  const data = expectsJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "string"
        ? data.trim()
        : data?.error || data?.message || `Request failed (${response.status}).`;

    if (response.status === 413) {
      throw new Error("The selected photo is too large. Try a closer crop or retake at lower resolution.");
    }

    throw new Error(message || `Request failed (${response.status}).`);
  }

  if (!expectsJson || !data || typeof data !== "object") {
    throw new Error("Unexpected server response. Please try again.");
  }

  return data;
}

function persistAppState() {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state.app));
}

function loadAppState() {
  const today = todayKey();

  try {
    const existing = JSON.parse(localStorage.getItem(APP_STORAGE_KEY));
    if (existing?.days) {
      return {
        goals: { ...GOALS, ...(existing.goals || {}) },
        days: existing.days
      };
    }
  } catch {
    return createFreshAppState(today);
  }

  try {
    const legacyDay = JSON.parse(localStorage.getItem(LEGACY_DAY_STORAGE_KEY));
    if (legacyDay?.meals) {
      return {
        goals: { ...GOALS },
        days: {
          [legacyDay.date || today]: legacyDay
        }
      };
    }
  } catch {
    return createFreshAppState(today);
  }

  return createFreshAppState(today);
}

function createFreshAppState(today) {
  return {
    goals: { ...GOALS },
    days: {
      [today]: createEmptyDay(today)
    }
  };
}

function createEmptyDay(date) {
  return {
    date,
    meals: Object.fromEntries(MEALS.map((meal) => [meal.key, []]))
  };
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getMealLabel(mealKey) {
  return MEALS.find((meal) => meal.key === mealKey)?.label || mealKey;
}

function formatLongDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function formatHistoryDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = todayKey();
  if (dateString === today) {
    return "Today";
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatShortDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1
  });
}

function round1(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hasScannerLibrary() {
  return typeof window.Html5Qrcode === "function";
}

function updateBarcodeSupportState() {
  if (!elements.barcodeSupportText) {
    return;
  }

  if (hasScannerLibrary()) {
    elements.barcodeSupportText.textContent =
      "Live scan is available here. You can also scan a saved barcode photo or enter the code manually.";
  } else {
    elements.barcodeSupportText.textContent =
      "The scanner library has not loaded yet. Refresh the page if live scanning does not appear.";
  }
}

async function detectBarcodeFromFile(file) {
  const scanner = getScannerInstance();
  try {
    return await scanner.scanFile(file, true);
  } finally {
    await scanner.clear();
    renderScannerIdleState();
    updateBarcodeSupportState();
  }
}

function getScannerInstance() {
  if (!state.scanner.instance) {
    state.scanner.instance = new window.Html5Qrcode("barcodeScannerRegion", {
      formatsToSupport: barcodeFormats()
    });
  }

  return state.scanner.instance;
}

async function pickPreferredCamera() {
  const cameras = await window.Html5Qrcode.getCameras();
  const preferred = cameras.find((camera) =>
    /back|rear|environment/i.test(camera.label || "")
  );

  return preferred || null;
}

function barcodeFormats() {
  const formats = window.Html5QrcodeSupportedFormats;
  if (!formats) {
    return [];
  }

  return [
    formats.UPC_A,
    formats.UPC_E,
    formats.EAN_13,
    formats.EAN_8,
    formats.CODE_128
  ].filter(Boolean);
}

function renderScannerIdleState() {
  if (!elements.barcodeScannerRegion || state.scanner.isRunning) {
    return;
  }

  if (!elements.barcodeScannerRegion.children.length) {
    elements.barcodeScannerRegion.innerHTML =
      '<div class="scanner-placeholder">Start the scanner to use your camera.</div>';
  }
}

async function buildOptimizedPhotoDataUrl(file) {
  let candidate = "";

  for (const attempt of PHOTO_UPLOAD_ATTEMPTS) {
    candidate = await imageFileToJpegDataUrl(file, attempt);
    if (estimateDataUrlBytes(candidate) <= PHOTO_UPLOAD_TARGET_MAX_BYTES) {
      return candidate;
    }
  }

  if (candidate) {
    return candidate;
  }

  throw new Error("Unable to prepare that image for upload.");
}

async function buildScannerReadyImageFile(file) {
  const jpegDataUrl = await imageFileToJpegDataUrl(file, BARCODE_IMAGE_PREP);
  const blob = dataUrlToBlob(jpegDataUrl);
  const safeName = toJpegFileName(file.name || "barcode-photo.jpg");
  return new File([blob], safeName, { type: "image/jpeg" });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

function toJpegFileName(name) {
  return String(name).replace(/\.[a-z0-9]+$/i, "") + ".jpg";
}

function dataUrlToBlob(dataUrl) {
  const [header, base64 = ""] = String(dataUrl).split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] || "image/jpeg";
  const bytes = atob(base64);
  const output = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes.charCodeAt(index);
  }

  return new Blob([output], { type: mime });
}

async function imageFileToJpegDataUrl(file, { maxDimension, quality }) {
  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const { width, height } = scaleToFit(sourceWidth, sourceHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not available in this browser.");
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function scaleToFit(width, height, maxDimension) {
  if (!width || !height || !maxDimension || Math.max(width, height) <= maxDimension) {
    return { width: Math.max(width || 1, 1), height: Math.max(height || 1, 1) };
  }

  const ratio = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This image format could not be read. Try a JPG or PNG photo."));
    };

    image.src = objectUrl;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
