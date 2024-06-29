/** Formats time to a short 5:34p, 10:35a.*/
function formatTime(time) {
  return dtFormat.format(time)
    .replace("M", "")
    .replace(" ", "")
    .toLowerCase();
}

var statusText = {
  early: "Early",
  late: "Late",
  ontime: "On Time",
  scheduled: "No GPS"
}

/** Returns a status (enum) from a stop time. */
function getStatus(stopTime) {
  return stopTime.realtimeState === "SCHEDULED"
  ? "scheduled"
  : stopTime.departureDelay > 120
  ? "late"
  : stopTime.departureDelay < -60
  ? "early"
  : "ontime";
}

function stopTimeComparator(st1, st2) {
  return st1.serviceDay + st1.scheduledDeparture - st2.serviceDay - st2.scheduledDeparture;
}

function printStopTimes(stop) {
  var stopTitle = document.getElementById("stop-title");
  stopTitle.innerHTML = `${stop.name} <span class="stopcode">${stop.code}</span>`;
  var stimes = stop.stopTimes;

  var allTimes = [];
  for (var i = 0; i < stimes.length; i++) {
    var pattern = stimes[i].pattern;
    var times = stimes[i].times;
    for (var j = 0; j < times.length; j++) {
      // Exclude last stops in the pattern (assumes position is 1-based)
      var isLastStop = times[j].stopPosition === pattern.stops.length;
      if (!isLastStop) {
        allTimes.push(times[j]);
      }
    }
  }

  allTimes.sort(stopTimeComparator);
  var content = "";
  var now = new Date().valueOf();
  for (var i = 0; i < allTimes.length; i++) {
    var tj = allTimes[i];
    var time = (tj.serviceDay + tj.scheduledDeparture) * 1000;
    var actualTime = (tj.serviceDay + tj.realtimeDeparture) * 1000;
    var route = stop.routes.find(r => r.id === tj.trip.route.gtfsId) || {};
    var status = getStatus(tj);
    var minutesUntil = Math.floor((actualTime - now) / 1000 / 60);
    var showStatus = minutesUntil <= 20;
    var showCountdown = showStatus && status !== "scheduled";
    var isConfirmed = tj.realtime;
    var statusContent = showStatus
      ? (
        (showCountdown ? `${minutesUntil}<span class="m-letter">m</span>` : "") +
        `<span class="detail">
          ${statusText[status] || ""}
          ${status === "early" || status === "late" ? " " + Math.floor(Math.abs(tj.departureDelay) / 60) + "m" : ""}
        </span>`
        )
      : isConfirmed
      ? `<span class="detail">On its way</span>`
      : "";
    content += `<tr>
      <td class="route">${route.shortName}</td>
      <td class="time">${formatTime(time)}</td>
      <td>${tj.headsign}</td>
      <td class="status ${showStatus ? status : ""}">
        ${statusContent}
      </td>
    </tr>`;
  }
  document.getElementById("departures-body").innerHTML = content;
}

var query =
`query StopTimes(
  $stopId: String!
) {
  stop(id: $stopId) {
    id: gtfsId
    code
    locationType
    name
    wheelchairBoarding
    routes {
      id: gtfsId
      agency {
        gtfsId
        name
      }
      longName
      mode
      color
      textColor
      shortName
    }

    stopTimes: stoptimesForPatterns(numberOfDepartures: 100, timeRange: 10800) {
      pattern {
        desc: name
        headsign
        id: code
        stops {
          id
        }
      }
      times: stoptimes {
        arrivalDelay
        departureDelay
        headsign
        realtime
        realtimeArrival
        realtimeDeparture
        realtimeState
        scheduledArrival
        scheduledDeparture
        serviceDay
        stopPosition
        timepoint
        trip {
          id
          route {
            gtfsId
          }
        }
      }
    }
  }
}`;

function fetchByGtfsId(gtfsId) {
  if (gtfsId) {
    var body = {
      query,
      variables: {
        stopId: gtfsId // "MARTA:81900"
      }
    }    
    fetch(getOtpGraphQLEndpoint(), {
      "body": JSON.stringify(body),
      "headers": {
        "content-type": "application/json"
      },
      "method": "POST",
      "mode": "cors"
    })
    .then(response => response.text())
    .then(text => {
      var loadedStop = JSON.parse(text).data.stop;
      printStopTimes(loadedStop);
    });  
  }
}

var sId = getGtfsId();
if (sId) fetchByGtfsId(sId);
else {
  var stopId = getStopId();
  if (stopId) {
    fetchStopId(stopId)
      .then(fetchByGtfsId)
      .then(() => updateLinks(stopId));
  }
}
