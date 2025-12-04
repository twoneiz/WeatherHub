const OPENWEATHER_API_KEY = "d38fbf146ca1ece59539858de00b1e49";

let map, marker, infowindow;
let weatherLayer = null;

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
  fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
  )
    .then((res) => res.json())
    .then((data) => {
      const name = overrideName || data.name || "Selected location";
      updateWeatherPanel(data, name);
      const content = `
        <div class="weather-popup">
          <strong>${name}</strong><br>
          ${data.weather[0].main}, ${Math.round(data.main.temp)}°C<br>
          Humidity: ${data.main.humidity}%<br>
          Wind: ${data.wind.speed} m/s
        </div>
      `;
      infowindow.setContent(content);
      infowindow.open(map, marker);
    })
    .catch(() => {
      // Fail silently for now
    });
}

function updateWeatherPanel(data, name) {
  const loc = document.getElementById("locationName");
  const temp = document.getElementById("weatherTemp");
  const main = document.getElementById("weatherMain");
  const feels = document.getElementById("realFeel");
  const humid = document.getElementById("humidity");
  const wind = document.getElementById("windSpeed");
  const sunrise = document.getElementById("sunriseTime");
  const sunset = document.getElementById("sunsetTime");
  const localTime = document.getElementById("localTime");
  const updated = document.getElementById("updatedAt");

  if (!data || !data.main) return;

  loc.textContent = name;
  temp.textContent = `${Math.round(data.main.temp)}°C`;
  main.textContent =
    data.weather && data.weather[0] ? data.weather[0].description : "--";
  feels.textContent = `${Math.round(data.main.feels_like)}°C`;
  humid.textContent = `${data.main.humidity}%`;
  wind.textContent = `${data.wind.speed} m/s`;

  const tzOffset = typeof data.timezone === "number" ? data.timezone : 0;

  sunrise.textContent =
    data.sys && data.sys.sunrise && data.timezone !== undefined
      ? formatTimeWithOffset(data.sys.sunrise, tzOffset)
      : "--:--";
  sunset.textContent =
    data.sys && data.sys.sunset && data.timezone !== undefined
      ? formatTimeWithOffset(data.sys.sunset, tzOffset)
      : "--:--";

  if (localTime) {
    localTime.textContent = formatCurrentLocalTime(tzOffset);
  }

  updated.textContent = data.dt
    ? `Updated: ${formatTimeWithOffset(data.dt, tzOffset)} (local)`
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

window.onload = initMap;
