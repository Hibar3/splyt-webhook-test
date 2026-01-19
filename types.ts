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

type DriverSubscriptionRequest = {
  driver_id: string;
  since?: string;
};