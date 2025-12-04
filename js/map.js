const OPENWEATHER_API_KEY = "d38fbf146ca1ece59539858de00b1e49";

let map, marker, infowindow;
let weatherLayer = null;
let lastCurrentData = null;
let lastForecastData = null;
let lastForecast5Data = null;
let lastLocationName = "";
let lastTzOffset = 0;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 5.3302, lng: 103.1408 }, // Default: Terengganu
    zoom: 10,
  });

  infowindow = new google.maps.InfoWindow();

  map.addListener("click", function (e) {
    placeMarker(e.latLng);
    fetchWeather(e.latLng.lat(), e.latLng.lng());
  });

  const layerSelect = document.getElementById("weatherLayerSelect");
  if (layerSelect) {
    layerSelect.onchange = function () {
      setWeatherOverlay(this.value);
    };
  }

  const input = document.getElementById("mapSearch");
  const searchBox = new google.maps.places.SearchBox(input);

  searchBox.addListener("places_changed", function () {
    const places = searchBox.getPlaces();
    if (places.length === 0) return;
    const place = places[0];
    map.setCenter(place.geometry.location);
    placeMarker(place.geometry.location);
    fetchWeather(
      place.geometry.location.lat(),
      place.geometry.location.lng(),
      place.formatted_address || place.name
    );
  });

  const locateBtn = document.getElementById("locateBtn");
  if (locateBtn && navigator.geolocation) {
    locateBtn.onclick = () => getUserLocation();
  }

  if (navigator.geolocation) {
    getUserLocation();
  }
}

function getUserLocation() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const loc = new google.maps.LatLng(latitude, longitude);
      map.setCenter(loc);
      map.setZoom(11);
      placeMarker(loc);
      fetchWeather(latitude, longitude);
    },
    () => {
      // If geolocation fails, keep default view
    }
  );
}

function placeMarker(location) {
  if (marker) marker.setMap(null);
  marker = new google.maps.Marker({
    position: location,
    map: map,
  });
}

function fetchWeather(lat, lon, overrideName) {
  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  const oneCallUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&exclude=minutely,alerts`;
  const forecast5Url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;

  Promise.allSettled([fetch(currentUrl), fetch(oneCallUrl), fetch(forecast5Url)])
    .then(async ([currentRes, oneCallRes, forecast5Res]) => {
      const currentData =
        currentRes.status === "fulfilled" && currentRes.value.ok
          ? await currentRes.value.json()
          : null;
      const forecastData =
        oneCallRes.status === "fulfilled" && oneCallRes.value.ok
          ? await oneCallRes.value.json()
          : null;
      const forecast5Data =
        forecast5Res.status === "fulfilled" && forecast5Res.value.ok
          ? await forecast5Res.value.json()
          : null;

      const name =
        overrideName || (currentData && currentData.name) || "Selected location";

      lastCurrentData = currentData;
      lastForecastData = forecastData;
      lastForecast5Data = forecast5Data;
      lastLocationName = name;

      const tzOffset =
        (forecastData && typeof forecastData.timezone_offset === "number"
          ? forecastData.timezone_offset
          : null) ??
        (forecast5Data &&
          forecast5Data.city &&
          typeof forecast5Data.city.timezone === "number"
          ? forecast5Data.city.timezone
          : null) ??
        (currentData && typeof currentData.timezone === "number"
          ? currentData.timezone
          : 0);
      lastTzOffset = tzOffset || 0;

      updateWeatherPanel(currentData, forecastData, name, {
        tzOffsetOverride: lastTzOffset,
      });

      const hourlySource =
        (forecastData && Array.isArray(forecastData.hourly)
          ? forecastData.hourly
          : null) ||
        deriveHourlyFromForecast(forecast5Data && forecast5Data.list);
      const dailySource =
        (forecastData && Array.isArray(forecastData.daily)
          ? forecastData.daily
          : null) ||
        deriveDailyFromForecast(forecast5Data && forecast5Data.list, lastTzOffset);

      renderHourlyForecast(hourlySource, lastTzOffset);
      renderDailyForecast(dailySource, lastTzOffset);

      const popupWeather =
        currentData && currentData.weather && currentData.weather[0]
          ? currentData.weather[0].main
          : "Weather";
      const popupTemp =
        currentData && currentData.main
          ? `${Math.round(currentData.main.temp)}°C`
          : "--";
      const popupHumidity =
        currentData &&
        currentData.main &&
        typeof currentData.main.humidity === "number"
          ? `${currentData.main.humidity}%`
          : "--";
      const popupWind =
        currentData &&
        currentData.wind &&
        typeof currentData.wind.speed === "number"
          ? `${currentData.wind.speed} m/s`
          : "--";

      const content = `
        <div class="weather-popup">
          <strong>${name}</strong><br>
          ${popupWeather}, ${popupTemp}<br>
          Humidity: ${popupHumidity}<br>
          Wind: ${popupWind}
        </div>
      `;
      infowindow.setContent(content);
      infowindow.open(map, marker);
    })
    .catch(() => {
      // Fail silently for now
    });
}

function buildSyntheticCurrentFromDaily(dayEntry) {
  if (!dayEntry) return null;
  return {
    main: {
      temp: dayEntry.temp && (dayEntry.temp.day ?? dayEntry.temp.max),
      feels_like: dayEntry.feels_like && dayEntry.feels_like.day,
      humidity: dayEntry.humidity,
      pressure: dayEntry.pressure,
      temp_min: dayEntry.temp && dayEntry.temp.min,
      temp_max: dayEntry.temp && dayEntry.temp.max,
    },
    wind: {
      speed: dayEntry.wind_speed,
      deg: dayEntry.wind_deg,
    },
    weather: dayEntry.weather,
    visibility: dayEntry.visibility,
    clouds: { all: dayEntry.clouds },
    dew_point: dayEntry.dew_point,
    rain: dayEntry.rain,
    snow: dayEntry.snow,
    pop: dayEntry.pop,
    sys: { sunrise: dayEntry.sunrise, sunset: dayEntry.sunset },
    dt: dayEntry.dt,
  };
}

function deriveHourlyFromForecast(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 5).map((entry) => ({
    dt: entry.dt,
    temp: entry.main ? entry.main.temp : null,
    weather: entry.weather,
    pop: entry.pop,
  }));
}

function deriveDailyFromForecast(list, tzOffset = 0) {
  if (!Array.isArray(list)) return null;
  const groups = {};
  list.forEach((entry) => {
    const local = new Date((entry.dt + tzOffset) * 1000);
    const key = `${local.getUTCFullYear()}-${local.getUTCMonth()}-${local.getUTCDate()}`;
    if (!groups[key]) {
      groups[key] = {
        dt: entry.dt,
        tempMin: entry.main ? entry.main.temp_min : null,
        tempMax: entry.main ? entry.main.temp_max : null,
        temps: [],
        humidity: [],
        pressure: [],
        windSpeeds: [],
        windDegs: [],
        weather: entry.weather,
        pop: [],
      };
    }
    const g = groups[key];
    if (entry.main) {
      g.tempMin =
        typeof g.tempMin === "number" && typeof entry.main.temp_min === "number"
          ? Math.min(g.tempMin, entry.main.temp_min)
          : entry.main.temp_min ?? g.tempMin;
      g.tempMax =
        typeof g.tempMax === "number" && typeof entry.main.temp_max === "number"
          ? Math.max(g.tempMax, entry.main.temp_max)
          : entry.main.temp_max ?? g.tempMax;
      g.temps.push(entry.main.temp);
      g.humidity.push(entry.main.humidity);
      g.pressure.push(entry.main.pressure);
    }
    if (entry.wind) {
      g.windSpeeds.push(entry.wind.speed);
      if (typeof entry.wind.deg === "number") g.windDegs.push(entry.wind.deg);
    }
    if (typeof entry.pop === "number") g.pop.push(entry.pop);
    if (!g.weather && entry.weather) g.weather = entry.weather;
  });

  const result = Object.values(groups)
    .sort((a, b) => a.dt - b.dt)
    .slice(0, 7)
    .map((g) => {
      const avg = (arr) =>
        Array.isArray(arr) && arr.length
          ? arr.reduce((s, v) => s + (Number(v) || 0), 0) / arr.length
          : null;
      const avgTemp = avg(g.temps);
      return {
        dt: g.dt,
        temp: {
          min: g.tempMin,
          max: g.tempMax,
          day: avgTemp,
        },
        feels_like: { day: avgTemp },
        humidity: avg(g.humidity),
        pressure: avg(g.pressure),
        wind_speed: avg(g.windSpeeds),
        wind_deg: g.windDegs.length
          ? Math.round(avg(g.windDegs))
          : undefined,
        weather: g.weather,
        pop: avg(g.pop),
      };
    });
  return result;
}

function updateWeatherPanel(currentData, forecastData, name, options = {}) {
  const loc = document.getElementById("locationName");
  const temp = document.getElementById("weatherTemp");
  const main = document.getElementById("weatherMain");
  const feels = document.getElementById("realFeel");
  const humid = document.getElementById("humidity");
  const wind = document.getElementById("windSpeed");
  const tempRange = document.getElementById("tempRange");
  const pressure = document.getElementById("pressure");
  const visibility = document.getElementById("visibility");
  const cloudCover = document.getElementById("cloudCover");
  const uvIndex = document.getElementById("uvIndex");
  const dewPoint = document.getElementById("dewPoint");
  const precipProb = document.getElementById("precipProb");
  const windDirection = document.getElementById("windDirection");
  const sunrise = document.getElementById("sunriseTime");
  const sunset = document.getElementById("sunsetTime");
  const localTime = document.getElementById("localTime");
  const updated = document.getElementById("updatedAt");

  const isDailyOverride = Boolean(options.selectedDailyEntry);
  const source = isDailyOverride
    ? buildSyntheticCurrentFromDaily(options.selectedDailyEntry)
    : currentData;

  if (!source || !source.main) return;

  loc.textContent = name || "Selected location";
  temp.textContent = `${Math.round(source.main.temp)}°C`;
  main.textContent =
    source.weather && source.weather[0]
      ? source.weather[0].description
      : "--";
  feels.textContent = `${Math.round(source.main.feels_like)}°C`;
  humid.textContent =
    typeof source.main.humidity === "number" ? `${Math.round(source.main.humidity)}%` : "--";
  wind.textContent =
    source.wind && typeof source.wind.speed === "number"
      ? `${Math.round(source.wind.speed)} m/s`
      : "--";

  const tzOffset =
    options.tzOffsetOverride ??
    (forecastData && typeof forecastData.timezone_offset === "number"
      ? forecastData.timezone_offset
      : typeof currentData?.timezone === "number"
      ? currentData.timezone
      : 0);

  const sunriseValue =
    (source.sys && source.sys.sunrise) ||
    (forecastData &&
      forecastData.current &&
      forecastData.current.sunrise);
  const sunsetValue =
    (source.sys && source.sys.sunset) ||
    (forecastData && forecastData.current && forecastData.current.sunset);

  const baseTempRangeEntry =
    (isDailyOverride && options.selectedDailyEntry) ||
    (forecastData &&
      forecastData.daily &&
      forecastData.daily[0]) ||
    null;

  const high =
    (baseTempRangeEntry &&
      baseTempRangeEntry.temp &&
      baseTempRangeEntry.temp.max) ||
    source.main.temp_max;
  const low =
    (baseTempRangeEntry &&
      baseTempRangeEntry.temp &&
      baseTempRangeEntry.temp.min) ||
    source.main.temp_min;

  if (tempRange && typeof high === "number" && typeof low === "number") {
    tempRange.textContent = `${Math.round(low)}° / ${Math.round(high)}°C`;
  } else if (tempRange) {
    tempRange.textContent = "-- / --";
  }

  if (pressure && typeof source.main.pressure === "number") {
    pressure.textContent = `${source.main.pressure} hPa`;
  } else if (pressure) {
    pressure.textContent = "--";
  }

  if (visibility) {
    if (typeof source.visibility === "number") {
      const km = source.visibility / 1000;
      visibility.textContent = `${km.toFixed(1)} km`;
    } else {
      visibility.textContent = "--";
    }
  }

  if (cloudCover) {
    const cloudsPercent =
      source.clouds && typeof source.clouds.all === "number"
        ? source.clouds.all
        : null;
    cloudCover.textContent =
      cloudsPercent !== null ? `${Math.round(cloudsPercent)}%` : "--";
  }

  if (uvIndex) {
    const uv =
      forecastData &&
      forecastData.current &&
      typeof forecastData.current.uvi === "number"
        ? forecastData.current.uvi.toFixed(1)
        : options.selectedDailyEntry &&
          typeof options.selectedDailyEntry.uvi === "number"
        ? options.selectedDailyEntry.uvi.toFixed(1)
        : null;
    uvIndex.textContent = uv || "--";
  }

  if (dewPoint) {
    const dp =
      (typeof source.dew_point === "number"
        ? source.dew_point
        : forecastData &&
          forecastData.current &&
          typeof forecastData.current.dew_point === "number"
        ? forecastData.current.dew_point
        : null);
    dewPoint.textContent =
      typeof dp === "number" ? `${Math.round(dp)}°C` : "--";
  }

  if (precipProb) {
    if (isDailyOverride && options.selectedDailyEntry) {
      const pop = options.selectedDailyEntry.pop;
      precipProb.textContent =
        typeof pop === "number" ? `${Math.round(pop * 100)}%` : "--";
    } else {
      const nextHourPop =
        forecastData &&
        forecastData.hourly &&
        forecastData.hourly[0] &&
        typeof forecastData.hourly[0].pop === "number"
          ? Math.round(forecastData.hourly[0].pop * 100)
          : null;
      const rainNow =
        currentData &&
        currentData.rain &&
        typeof currentData.rain["1h"] === "number"
          ? `${currentData.rain["1h"]} mm`
          : null;
      const snowNow =
        currentData &&
        currentData.snow &&
        typeof currentData.snow["1h"] === "number"
          ? `${currentData.snow["1h"]} mm snow`
          : null;
      if (nextHourPop !== null) {
        precipProb.textContent = `${nextHourPop}%`;
      } else if (rainNow) {
        precipProb.textContent = rainNow;
      } else if (snowNow) {
        precipProb.textContent = snowNow;
      } else {
        precipProb.textContent = "--";
      }
    }
  }

  if (windDirection) {
    const windDeg =
      source.wind && typeof source.wind.deg === "number"
        ? source.wind.deg
        : null;
    windDirection.textContent =
      windDeg !== null ? `${degreesToCardinal(windDeg)} (${windDeg}°)` : "--";
  }

  sunrise.textContent =
    sunriseValue && tzOffset !== undefined
      ? formatTimeWithOffset(sunriseValue, tzOffset)
      : "--:--";
  sunset.textContent =
    sunsetValue && tzOffset !== undefined
      ? formatTimeWithOffset(sunsetValue, tzOffset)
      : "--:--";

  if (localTime) {
    localTime.textContent = formatCurrentLocalTime(tzOffset);
  }

  updated.textContent = source.dt
    ? `Updated: ${formatTimeWithOffset(source.dt, tzOffset)} (local time)`
    : `Updated: ${new Date().toLocaleTimeString()}`;
}

function setWeatherOverlay(type) {
  if (map && map.overlayMapTypes) {
    map.overlayMapTypes.clear();
  }
  weatherLayer = null;
  if (type && type !== "none") {
    weatherLayer = new google.maps.ImageMapType({
      getTileUrl: function (coord, zoom) {
        return `https://tile.openweathermap.org/map/${type}/${zoom}/${coord.x}/${coord.y}.png?appid=${OPENWEATHER_API_KEY}`;
      },
      tileSize: new google.maps.Size(256, 256),
      name: type,
      maxZoom: 19,
    });
    map.overlayMapTypes.insertAt(0, weatherLayer);
  }
}

function formatTimeWithOffset(utcSeconds, offsetSeconds) {
  const targetMs = (utcSeconds + offsetSeconds) * 1000;
  // Use UTC here because we've already shifted to the target timezone.
  return new Date(targetMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatCurrentLocalTime(offsetSeconds) {
  const utcNowSeconds = Math.floor(Date.now() / 1000);
  return formatTimeWithOffset(utcNowSeconds, offsetSeconds);
}

function formatHour(utcSeconds, offsetSeconds) {
  const targetMs = (utcSeconds + offsetSeconds) * 1000;
  return new Date(targetMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDay(utcSeconds, offsetSeconds) {
  const targetMs = (utcSeconds + offsetSeconds) * 1000;
  return new Date(targetMs).toLocaleDateString([], {
    weekday: "short",
  });
}

function degreesToCardinal(deg) {
  const directions = [
    "North",
    "North-Northeast",
    "Northeast",
    "East-Northeast",
    "East",
    "East-Southeast",
    "Southeast",
    "South-Southeast",
    "South",
    "South-Southwest",
    "Southwest",
    "West-Southwest",
    "West",
    "West-Northwest",
    "Northwest",
    "North-Northwest",
  ];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

function renderHourlyForecast(hourlyData, tzOffset) {
  const container = document.getElementById("hourlyForecast");
  const caption = document.getElementById("forecastCaption");
  if (caption) caption.textContent = "Next 3 Hour";
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(hourlyData)) return;

  const offset = typeof tzOffset === "number" ? tzOffset : 0;
  hourlyData.slice(0, 5).forEach((entry) => {
    const card = document.createElement("div");
    card.className = "forecast-chip";
    const icon = entry.weather && entry.weather[0] ? entry.weather[0].icon : null;
    const weatherLabel =
      entry.weather && entry.weather[0] ? entry.weather[0].main : "--";
    const iconUrl = icon
      ? `https://openweathermap.org/img/wn/${icon}@2x.png`
      : "";
    card.innerHTML = `
      <div class="small text-muted">${formatHour(entry.dt, offset)}</div>
      ${iconUrl ? `<img src="${iconUrl}" alt="${weatherLabel}" width="46" height="46">` : ""}
      <div class="temp">${Math.round(entry.temp)}°C</div>
      <div class="small text-capitalize">${weatherLabel}</div>
    `;
    container.appendChild(card);
  });
}

function renderDailyForecast(dailyData, tzOffset) {
  const container = document.getElementById("dailyForecast");
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(dailyData)) return;
  const offset = typeof tzOffset === "number" ? tzOffset : 0;

  // Next 7 days; onecall daily already includes today, forecast fallback is already limited to 7
  const days = dailyData.length > 7 ? dailyData.slice(1, 8) : dailyData.slice(0, 7);
  days.forEach((day) => {
    const icon = day.weather && day.weather[0] ? day.weather[0].icon : null;
    const weatherLabel =
      day.weather && day.weather[0] ? day.weather[0].main : "--";
    const iconUrl = icon
      ? `https://openweathermap.org/img/wn/${icon}@2x.png`
      : "";
    const card = document.createElement("div");
    card.className = "forecast-day";
    card.innerHTML = `
      <div class="fw-semibold">${formatDay(day.dt, offset)}</div>
      ${iconUrl ? `<img src="${iconUrl}" alt="${weatherLabel}">` : ""}
      <div class="small text-capitalize">${weatherLabel}</div>
      <div class="fw-semibold">${Math.round(day.temp.max)}° / ${Math.round(
      day.temp.min
    )}°C</div>
    `;

    card.onclick = () => {
      container.querySelectorAll(".forecast-day").forEach((el) =>
        el.classList.remove("active")
      );
      card.classList.add("active");

      const synthetic = buildSyntheticCurrentFromDaily(day);
      updateWeatherPanel(synthetic, lastForecastData, lastLocationName, {
        selectedDailyEntry: day,
        tzOffsetOverride: lastTzOffset,
      });
    };

    container.appendChild(card);
  });
}

window.onload = initMap;
