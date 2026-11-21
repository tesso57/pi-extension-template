------------------------- MODULE GreetingProofs ------------------------
EXTENDS Greeting, TLAPS

THEOREM GreetingSafety == Spec => []Safety
<1>1. Init => Safety
    BY SMT DEF Init, Safety
<1>2. Safety /\ [Next]_vars => Safety'
    <2>1. Safety /\ Register => Safety'
        BY DEF Safety, Register
    <2>2. \A i \in Invocations : Safety /\ Dispatch(i) => Safety'
        BY SMT DEF Safety, Dispatch
    <2>3. \A i \in Invocations : Safety /\ Handle(i) => Safety'
        BY SMT DEF Safety, Handle, Greeting, NoDelivery, Delivery
    <2>4. Safety /\ UNCHANGED vars => Safety'
        BY DEF Safety, vars
    <2>5. QED
        BY <2>1, <2>2, <2>3, <2>4 DEF Next
<1>3. QED
    BY <1>1, <1>2, PTL DEF Spec

=======================================================================
