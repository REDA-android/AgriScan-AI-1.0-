import { User } from 'firebase/auth';
import { FieldValue } from 'firebase/firestore';

export interface Location {
  lat: number;
  lng: number;
}

export interface OrganCounts {
  flowers: number;
  fruits: number;
  details: string;
}

export interface PhenotypicTraits {
  color: string;
  shape: string;
  size: string;
  healthStatus: string;
  diseasesOrDeficiencies: string[];
}

export interface Observation {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  domain: string;
  location: Location;
  createdAt: FieldValue | any;
  capturedAt: string;
  imageUrl: string;
  imageUrls?: string[];
  culture: string;
  species?: string;
  variety?: string;
  family?: string;
  phenologicalStage?: string;
  bbchDominant?: string;
  bbchSecondary?: string[];
  organCounts?: OrganCounts;
  phenotypicTraits?: PhenotypicTraits;
  description?: string;
  userNotes?: string;
  status: 'analyzing' | 'completed' | 'error' | 'pending';
  isDeletedByCreator?: boolean;
  
  // Additional fields for field operations
  plantingDate?: string | null;
  breeder?: string | null;
  pruningDate?: string | null;
  harvestQuantity?: string | null;
  density?: string | null;
  fruitFirmness?: string | null;
  defects?: string | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user' | 'viewer';
  status: 'pending' | 'approved' | 'rejected';
  accessStatus?: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  lastLogin?: any;
}

export interface BackgroundTask {
  id: string;
  type: 'upload' | 'analysis' | 'sync';
  progress: number;
  status?: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

export interface WeatherData {
  temp: number;
  humidity: number;
  wind: number;
  precip: number;
  description: string;
  icon: string;
  forecast: any[];
}
