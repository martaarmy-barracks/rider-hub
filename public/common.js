function getOtpUrl() {
    return "https://1ymbrzcqqg.execute-api.us-east-1.amazonaws.com/test/otp2";
}

function getOtpGraphQLEndpoint() {
    return `${getOtpUrl()}/gtfs/v1`;
}

function getOtpStopGeocoderEndpoint() {
    return `${getOtpUrl()}/geocode`;    
}

var dtFormat = new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
    timeZone: "America/New_York",
});

function getParam(name) {
    var search = window.location.search;
    if (search === "") return null;
    var nameEq = `${name}=`;
    var param = search.substring(1, 1 + nameEq.length);
    if (param === nameEq) {
        return decodeURIComponent(search.substring(1 + nameEq.length));
    }
    return null;
}

function getStopId() {
    return getParam("stopid");
}

function getGtfsId() {
    return getParam("gtfsid");
}

function fetchStopId(stopId) {
    // Geocode
    return fetch(`${getOtpStopGeocoderEndpoint()}?query=${stopId}`)
        .then(response => response.text())
        .then(text => {
            var suggestedStops = JSON.parse(text);
            if (suggestedStops.length === 0) return null
            return suggestedStops[0].id;
        });        
}

function stopInput_keydown(evt) {
    var stoplist = document.getElementById("stoplist");
    var value = evt.target.value;
    if (value.length >= 3) {
        // Geocode
        fetch(`${getOtpStopGeocoderEndpoint()}?query=${value}`)
          .then(response => response.text())
          .then(text => {
            var suggestedStops = JSON.parse(text);
            var listContent = "";
            suggestedStops.forEach(s => {
                var d = s.description;
                var stopId = d.substring(
                    d.lastIndexOf("(") + 1,
                    d.lastIndexOf(")")    
                );
                listContent += `<option value=${stopId}>${d}</option>`;
            })
            stoplist.innerHTML = listContent;
          });        
    } else {
        stoplist.innerHTML = "";
    }
}

function stopInput_change(evt) {
    // Auto-submit at 6 characters
    if (evt.target.value.length === 6) {
        evt.target.form.submit();
    }
}

function updateLinks(stopId) {
    var stopIdEncoded = encodeURIComponent(stopId);
    document.getElementById("departure-link").href = `stop-departures.html?stopid=${stopIdEncoded}`;
    document.getElementById("schedule-link").href = `stop-schedule.html?stopid=${stopIdEncoded}`;
}

function attachSearchEvents() {
    var input = document.getElementById("stopsearch");
    input.addEventListener("keyup", stopInput_keydown);
    input.addEventListener("change", stopInput_change);
}
attachSearchEvents();
