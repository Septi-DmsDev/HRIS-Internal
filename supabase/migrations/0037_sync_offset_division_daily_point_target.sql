update public.divisions
set daily_point_target = 39000,
    updated_at = now()
where upper(code) = 'OFFSET'
  and daily_point_target <> 39000;

