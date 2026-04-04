-- Seed 7 permanent recipes for LifeOS
-- Run: duckdb md:my_db < seed-recipes.sql

-- Clear old data
DELETE FROM lifeos.recipe_favorites;
DELETE FROM lifeos.meal_plans;
DELETE FROM lifeos.recipes;

-- R1: Spicy Beef & Spinach Fried Rice Skillet
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r1-spicy-beef-rice',
  'Spicy Beef & Spinach Fried Rice Skillet',
  '[{"name":"ground beef","qty":"400g"},{"name":"Bens Bistro Express fried rice","qty":"1 pouch"},{"name":"spinach","qty":"100g"},{"name":"bell pepper","qty":"100g"},{"name":"shredded cheese","qty":"60g"}]',
  '1. Brown beef with Franks, Worcestershire, paprika, garlic powder
2. Add spinach and bell pepper, cook until wilted
3. Add fried rice pouch, stir to combine
4. Top with shredded cheese, lid on 2 min',
  2, 746,
  '{"calories":746,"protein_g":54.5,"batch_calories":1492,"batch_protein_g":109}',
  ARRAY['beef','rice','quick']
);

-- R2: Tuna Cottage Cheese Rice Bowl
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r2-tuna-cottage-rice',
  'Tuna Cottage Cheese Rice Bowl',
  '[{"name":"canned tuna","qty":"3 cans"},{"name":"cottage cheese","qty":"200g"},{"name":"Bens fried rice","qty":"1 pouch"},{"name":"bell pepper","qty":"100g"},{"name":"spinach","qty":"100g"},{"name":"shredded cheese","qty":"50g"}]',
  '1. Heat rice per package
2. Drain tuna, mix with cottage cheese
3. Combine rice + tuna mixture
4. Top with diced bell pepper, spinach, cheese
5. Season with Franks, garlic powder, onion powder',
  2, 630,
  '{"calories":630,"protein_g":63,"batch_calories":1261,"batch_protein_g":126.5}',
  ARRAY['tuna','rice','high-protein']
);

-- R3: Greek Yogurt Tuna Rice Bowl
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r3-yogurt-tuna-rice',
  'Greek Yogurt Tuna Rice Bowl',
  '[{"name":"canned tuna","qty":"3 cans"},{"name":"Greek yogurt 0%","qty":"200g"},{"name":"Bens fried rice","qty":"1 pouch"},{"name":"bell pepper","qty":"100g"},{"name":"spinach","qty":"100g"},{"name":"shredded cheese","qty":"60g"}]',
  '1. Heat rice per package
2. Drain tuna, mix with Greek yogurt
3. Combine rice + tuna mixture
4. Top with diced bell pepper, spinach, cheese
5. Season with Franks, garlic powder, onion powder',
  2, 627,
  '{"calories":627,"protein_g":63.5,"batch_calories":1254,"batch_protein_g":127}',
  ARRAY['tuna','rice','high-protein']
);

-- R4: Beef & Brussels Rice Stir Fry
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r4-beef-brussels-rice',
  'Beef & Brussels Rice Stir Fry',
  '[{"name":"ground beef","qty":"400g"},{"name":"Bens fried rice","qty":"1 pouch"},{"name":"brussels sprouts","qty":"150g"},{"name":"spinach","qty":"100g"},{"name":"shredded cheese","qty":"50g"}]',
  '1. Brown beef with Worcestershire, paprika, garlic powder
2. Add halved brussels sprouts, cook 5 min
3. Add spinach + fried rice, stir to combine
4. Top with cheese',
  2, 744,
  '{"calories":744,"protein_g":56,"batch_calories":1487,"batch_protein_g":111.5}',
  ARRAY['beef','rice','quick']
);

-- R5: Spicy Beef Bolognese
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r5-beef-bolognese',
  'Spicy Beef Bolognese',
  '[{"name":"ground beef","qty":"400g"},{"name":"dry penne","qty":"80g"},{"name":"Prego sauce","qty":"250ml"},{"name":"spinach","qty":"100g"},{"name":"shredded cheese","qty":"80g"}]',
  '1. Brown beef
2. Add Prego sauce + Franks, garlic powder, onion powder
3. Simmer 10 min
4. Cook penne, drain
5. Toss pasta with sauce + spinach
6. Top with cheese',
  2, 730,
  '{"calories":730,"protein_g":58.5,"batch_calories":1459,"batch_protein_g":117}',
  ARRAY['beef','pasta']
);

-- R6: Tuna Marinara Pasta
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r6-tuna-marinara-pasta',
  'Tuna Marinara Pasta',
  '[{"name":"canned tuna","qty":"3 cans"},{"name":"dry penne","qty":"80g"},{"name":"Prego sauce","qty":"250ml"},{"name":"bell pepper","qty":"100g"},{"name":"spinach","qty":"100g"},{"name":"shredded cheese","qty":"170g"}]',
  '1. Cook penne, drain
2. Heat Prego sauce with drained tuna + diced pepper + spinach
3. Toss with pasta
4. Heavy cheese on top
5. Season with garlic powder + Franks',
  2, 743,
  '{"calories":743,"protein_g":69,"batch_calories":1485,"batch_protein_g":138.5}',
  ARRAY['tuna','pasta','high-protein']
);

-- R7: Beef & Brussels Pasta Bake
INSERT INTO lifeos.recipes (id, name, ingredients, instructions, servings, calories_per_serving, macros, tags) VALUES (
  'r7-beef-brussels-pasta-bake',
  'Beef & Brussels Pasta Bake',
  '[{"name":"ground beef","qty":"400g"},{"name":"dry rigatoni","qty":"80g"},{"name":"Prego sauce","qty":"250ml"},{"name":"brussels sprouts","qty":"150g"},{"name":"shredded cheese","qty":"80g"}]',
  '1. Brown beef with garlic powder, paprika, Franks
2. Cook rigatoni, drain
3. Combine beef + pasta + Prego + halved brussels sprouts in baking dish
4. Top with cheese
5. Bake 375F for 15-20 min',
  2, 746,
  '{"calories":746,"protein_g":59.5,"batch_calories":1501,"batch_protein_g":120}',
  ARRAY['beef','pasta','bake']
);
