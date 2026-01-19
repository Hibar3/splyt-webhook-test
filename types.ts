type EventInfo = {
  name: string;
  time: string;
};

type EventData = {
  driver: string;
  latitude: number;
  longitude: number;
  timestamp: string;
};

type EventRequestBody = {
  event: EventInfo;
  data: EventData;
};