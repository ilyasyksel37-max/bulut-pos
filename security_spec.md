# Security Specification for Sepetay Kırtasiye

## Data Invariants
1. Products must have a positive price and stock count.
2. Sales must include at least one item and the total must match the sum of items (enforced by logic, verified by total > 0).
3. Users must have a role assigned ('admin' or 'staff').
4. Admins can perform all operations. Staff can perform sales and view products/customers.

## The Dirty Dozen Payloads
1. Create a product with price: -10 (Should fail: price >= 0).
2. Create a product with stock: -5 (Should fail: stock >= 0).
3. Update product price as 'staff' (Should fail: admin only for catalog changes).
4. Create a sale without items (Should fail: required items).
5. Set `totalSpent` on a customer directly without a sale (Should fail: logic enforced).
6. Change your own user role to 'admin' as a 'staff' user.
7. Delete a sale record (Should fail: sales are immutable for history).
8. Create an expense with amount: -50.
9. Fetch all users without being an admin.
10. Update `updatedAt` with a client timestamp instead of server timestamp.
11. Inject a 1MB string into product name.
12. Delete a product without admin rights.

## Test Runner (Partial Draft)
- `expect(createProduct(invalidPayload)).toBeDenied()`
- `expect(updateProduct(staffUser)).toBeDenied()`
- `expect(deleteSale(anyUser)).toBeDenied()`
