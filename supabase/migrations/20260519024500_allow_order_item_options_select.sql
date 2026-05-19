do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_item_options'
      and policyname = 'Order item options are viewable with order items'
  ) then
    create policy "Order item options are viewable with order items"
    on public.order_item_options
    for select
    to public
    using (
      exists (
        select 1
        from public.order_items oi
        where oi.id = order_item_options.order_item_id
      )
    );
  end if;
end $$;
