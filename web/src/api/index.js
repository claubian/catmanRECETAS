import { mockClient } from "./mockClient.js";
import { httpClient } from "./httpClient.js";

// Use mocks only when explicitly requested; otherwise call the FastAPI API.
const useMock = import.meta.env.VITE_USE_MOCK === "true";

export const apiClient = useMock ? mockClient : httpClient;
export const isMock = useMock;
