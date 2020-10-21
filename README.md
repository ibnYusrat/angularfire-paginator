# AngularFire Paginator
A simple TypeScript class to paginate Firebase collections using @angular/fire.


# TL;DR
```
npm install angularfire-paginator

import {AngularFirePaginator} from 'angularfire-paginator'; // inside component (not module)

paginator: AngularFirePaginator<any>;

// inside onNgInit()
this.paginator = new AngularFirePaginator(this.angularFirestore, '/path/to/collection', 5);

// insde your template:
<span *ngFor="let item of paginator.items$">{{item.someProperty}}</span>
```

# Installation
`npm install angularfire-paginator`

# Usage
Simply import the class in the component where you'd like to show a paginator:

`import {AnagularFirePaginator} from 'angularfire-paginator';`

Then, inside your class define the variable like:

`paginator: AngularFirePaginator<any>;`

You can specify an interface or custom type when declaring the paginator which could be useful for intellisense autocomplete later on. 
Or you can simply go with `any` type.

Inside your `onNgInit()` function, initialize the paginator:

```
//This is the most basic setup.
this.paginator = new AngularFirePaginator(this.angularFirestore, '/path/to/collection/', 5);
```
First argument is your instance of `AngularFirestore` Service. Then the path to the collection that you'd like to paginate, and then number of items per page.

# Navigation between pages
To navigate back and forth, you can call these functions of this class:

```
paginator.next();
paginator.previous();
paginator.first();
paginator.last();
```

You can disable or enable these buttons if you use properties like `nextEnabled`, `previousEnabled`, `firstEnabled`, and `lastEnabled`.
These are booleans that will turn true or false based on, for example, whether more pages are available or not etc.

# Sort and Filter

Sorting and Filtering elements is also pretty straight forward. Simply create a variable of type `PaginatorSort` and/or `PaginatorFilter` and pass it as fourth and/or fifth argument of the constructor.

For example:

`let collectionSort: PaginatorSort[] = [{field: 'totalPoints', direction: 'desc'}];`

and then:
`let paginator = new AngularFirePaginator(this.angularFirestore, '/path/to/collection', 5, this.collectionSort);`

...you get the idea.


# Important
If you have type mismatch issues after importing the library, it is probably because your version of Angular or 
AngularFire does not match with the one this library was compiled with. I would suggest you copy the `index.ts` and 
rename it to something like `paginator.ts` etc and put it somewhere in your services folder, and then import it from 
there. That would get rid of all of such issues if you come across them. At the moment its just too difficult maintain 
multiple versions of this small class.

# Support
Create issues on the [Github Repo!](https://github.com/ibnyusrat/angularfire-paginator/issues) if you come across any, if this saves you sometime, please leave a star on Github, thanks!
