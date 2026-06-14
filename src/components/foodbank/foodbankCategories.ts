export type FoodbankCategory = {
  id: string;
  label: string;
  helper: string;
  visual: 'cereal' | 'milk' | 'mug' | 'pasta' | 'jar' | 'beans' | 'meat' | 'fish' | 'veg' | 'pudding' | 'fruit' | 'snacks' | 'toiletries' | 'baby' | 'pet';
};

export const foodbankCategories: FoodbankCategory[] = [
  { id: 'breakfast_cereals', label: 'Breakfast Cereals', helper: 'Cereal boxes, oats, porridge', visual: 'cereal' },
  { id: 'uht_milk', label: 'UHT Milk', helper: 'Long-life milk and cartons', visual: 'milk' },
  { id: 'tea_coffee', label: 'Tea / Coffee', helper: 'Tea bags, instant coffee, hot drinks', visual: 'mug' },
  { id: 'pasta_rice', label: 'Pasta / Rice', helper: 'Dry pasta, rice, couscous', visual: 'pasta' },
  { id: 'pasta_sauce_tinned_tomatoes', label: 'Pasta Sauce / Tinned Tomatoes', helper: 'Sauce jars and tinned tomatoes', visual: 'jar' },
  { id: 'baked_beans', label: 'Baked Beans', helper: 'Beans and similar staples', visual: 'beans' },
  { id: 'tinned_meat', label: 'Tinned Meat', helper: 'Meat tins and protein meals', visual: 'meat' },
  { id: 'tinned_fish', label: 'Tinned Fish', helper: 'Tuna, sardines, salmon', visual: 'fish' },
  { id: 'tinned_vegetables', label: 'Tinned Vegetables', helper: 'Peas, carrots, sweetcorn, mixed veg', visual: 'veg' },
  { id: 'rice_pudding_custard', label: 'Rice Pudding / Custard', helper: 'Dessert tins and cartons', visual: 'pudding' },
  { id: 'tinned_fruit', label: 'Tinned Fruit', helper: 'Fruit tins and fruit pots', visual: 'fruit' },
  { id: 'biscuits_snacks', label: 'Biscuits & Snacks', helper: 'Biscuits, crackers, small snacks', visual: 'snacks' },
  { id: 'toiletries', label: 'Toiletries', helper: 'Soap, toothpaste, hygiene', visual: 'toiletries' },
  { id: 'baby_items', label: 'Baby Items', helper: 'Nappies, wipes, baby food', visual: 'baby' },
  { id: 'pet_food', label: 'Pet Food', helper: 'Dog, cat, and small pet food', visual: 'pet' },
];