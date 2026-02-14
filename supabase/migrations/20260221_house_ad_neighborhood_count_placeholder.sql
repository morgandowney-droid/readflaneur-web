-- Replace hardcoded neighborhood count with dynamic placeholder in house ads
UPDATE house_ads
SET body = REPLACE(body, '128 neighborhoods', '{{neighborhood_count}} neighborhoods')
WHERE body LIKE '%128 neighborhoods%';
