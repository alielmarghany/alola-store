-- Removes all orders, clients and notifications made from sample data (@example.com clients).
-- Products stay: edit or delete those from the dashboard.
delete from orders where email like '%@example.com';
delete from customers where email like '%@example.com';
