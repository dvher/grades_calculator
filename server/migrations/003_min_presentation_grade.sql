-- Minimum average of the non-exam evaluations needed to take the exam (nota de presentación).
-- NULL turns the check off; existing classes get it switched on at the user's passing grade.
ALTER TABLE classes ADD COLUMN min_presentation_grade double precision;
UPDATE classes SET min_presentation_grade = users.pass_grade FROM users WHERE users.id = classes.user_id;
