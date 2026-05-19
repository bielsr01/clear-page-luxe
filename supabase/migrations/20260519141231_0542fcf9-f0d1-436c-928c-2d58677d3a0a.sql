update public.orders
set discount = round((coalesce(subtotal,0) + coalesce(delivery_fee,0) + coalesce(service_fee,0) - coalesce(total,0))::numeric, 2)
where coupon_code is not null
  and coalesce(discount, 0) = 0
  and (coalesce(subtotal,0) + coalesce(delivery_fee,0) + coalesce(service_fee,0) - coalesce(total,0)) > 0.009;