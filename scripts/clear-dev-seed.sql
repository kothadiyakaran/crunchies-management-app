-- scripts/clear-dev-seed.sql
-- Removes all rows seeded by dev-seed.sql.
--
-- order_items cascades via orders FK; production_logs reference products via
-- RESTRICT, so delete logs first, then orders, then products + customers.

begin;

delete from production_logs
 where product_id in (select id from products where name like '[DEV]%');

delete from orders
 where customer_id in (select id from customers where name like '[DEV]%')
    or id in (
      select o.id from orders o
       join order_items oi on oi.order_id = o.id
       join products p on p.id = oi.product_id
       where p.name like '[DEV]%'
    );

delete from products  where name like '[DEV]%';
delete from customers where name like '[DEV]%';

commit;
