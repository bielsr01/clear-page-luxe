ALTER TABLE public.supply_products
  ADD COLUMN IF NOT EXISTS admin_group_stock_map jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.handle_supply_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item record;
  _opt record;
  _gid uuid;
  _qty int;
  _mapped int;
  _rest int;
  _target uuid;
  _delivery_date date;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    _delivery_date := (COALESCE(NEW.delivered_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;

    FOR _item IN
      SELECT i.id AS item_id, i.product_id, i.product_name, i.quantity, i.unit_price,
             sp.stock_group_id, sp.total_quantity, sp.expense_category_id,
             COALESCE(sp.admin_group_stock_map, '{}'::jsonb) AS group_map
      FROM public.supply_order_items i
      LEFT JOIN public.supply_products sp ON sp.id = i.product_id
      WHERE i.supply_order_id = NEW.id
    LOOP
      _qty := _item.quantity * COALESCE(_item.total_quantity, 1);
      _mapped := 0;

      -- Distribui as quantidades das opções nos grupos de estoque do restaurante mapeados
      FOR _opt IN
        SELECT oo.option_name, oo.quantity, spo.admin_stock_subgroup_id, sub.group_id AS admin_group_id
        FROM public.supply_order_item_options oo
        LEFT JOIN public.supply_product_options spo
          ON spo.product_id = _item.product_id AND spo.name = oo.option_name
        LEFT JOIN public.admin_stock_subgroups sub
          ON sub.id = spo.admin_stock_subgroup_id
        WHERE oo.supply_order_item_id = _item.item_id
      LOOP
        -- Estoque admin (fábrica): desconta do subgrupo
        IF _opt.admin_stock_subgroup_id IS NOT NULL AND _opt.quantity > 0 THEN
          PERFORM public.apply_admin_stock_delta(
            _opt.admin_stock_subgroup_id, -_opt.quantity,
            'supply_delivery'::admin_stock_movement_type, NEW.id,
            'Pedido de insumo entregue'
          );
        END IF;

        -- Estoque do restaurante: soma no grupo mapeado para o grupo admin da opção
        _target := NULL;
        IF _opt.admin_group_id IS NOT NULL THEN
          _target := NULLIF(_item.group_map->>(_opt.admin_group_id::text), '')::uuid;
        END IF;

        IF _target IS NOT NULL AND COALESCE(_opt.quantity, 0) > 0 THEN
          PERFORM public.apply_stock_delta(NEW.restaurant_id, _target, _opt.quantity,
            'supply_delivery'::stock_movement_type, NEW.id,
            'Pedido de insumo entregue - ' || _opt.option_name);
          _mapped := _mapped + _opt.quantity;
        END IF;
      END LOOP;

      -- Restante (ou tudo, quando não há mapeamento) vai para o grupo padrão do insumo
      _gid := _item.stock_group_id;
      _rest := GREATEST(_qty - _mapped, 0);
      IF _gid IS NOT NULL AND _rest > 0 THEN
        PERFORM public.apply_stock_delta(NEW.restaurant_id, _gid, _rest,
          'supply_delivery'::stock_movement_type, NEW.id, 'Pedido de insumo entregue');
      END IF;

      IF _item.expense_category_id IS NOT NULL AND _item.quantity > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.expenses
          WHERE restaurant_id = NEW.restaurant_id
            AND notes = 'supply_order_item:' || _item.item_id::text
        ) THEN
          INSERT INTO public.expenses (restaurant_id, description, category, category_id, amount, expense_date, notes, created_by)
          VALUES (
            NEW.restaurant_id,
            _item.quantity::text || 'x ' || _item.product_name,
            (SELECT name FROM public.expense_categories WHERE id = _item.expense_category_id),
            _item.expense_category_id,
            (_item.unit_price * _item.quantity),
            _delivery_date,
            'supply_order_item:' || _item.item_id::text,
            NEW.created_by
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;