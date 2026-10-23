-- UWI St. Augustine students use firstname.lastname@my.uwi.edu; campus offices email from sta.uwi.edu.
-- (Source: UWI St. Augustine student guides on sta.uwi.edu, checked 2026-10-23.)
update public.universities set email_domains = array['my.uwi.edu', 'sta.uwi.edu']::text[] where id = 'uwi_st_augustine';
