export interface Holiday {
  holiday_id: number;
  country_code: string;
  date: string;
  name: string;
  type: string;
  is_public_holiday: boolean;
  source: string;
  fetched_at: string;
  created_at: string;
  updated_at?: string;
}

export interface HolidayRangeQuery {
  start_date: string;
  end_date: string;
  country_code?: string;
  public_only?: boolean;
}
